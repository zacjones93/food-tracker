import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { getPlatformProxy } from 'wrangler';
import { drizzle } from 'drizzle-orm/d1';
import { and, eq, or, sql, desc, asc, isNull, getTableColumns } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { recipeListColumns, recipeScheduleStatsQuery } from '../src/lib/recipe-list-queries';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { recipesTable: r, weeksTable: w, weekRecipesTable: wr, recipeBooksTable: b } = schema;
async function main() {
    const proxy = await getPlatformProxy<CloudflareEnv>();
    try {
        const binding = proxy.env.NEXT_TAG_CACHE_D1;
        assert.ok(binding);
        if (process.argv.includes('--enrich-fixture')) {
            // Local D1 only: the legacy seed omits all meal types, tags and book links.
            await binding.exec("UPDATE recipes SET mealType = CASE WHEN rowid % 2 = 0 THEN 'Dinner' ELSE 'Lunch' END, difficulty = 'Easy', tags = json_array('Quick', CASE WHEN rowid % 2 = 0 THEN 'Summer' ELSE 'Winter' END), recipeBookId = (SELECT id FROM recipe_books ORDER BY id LIMIT 1) WHERE rowid % 3 != 0;");
        }
        const db = drizzle(binding, { schema });
        const teams = await db.select({ id: w.teamId, n: sql<number> `count(*)` }).from(w).groupBy(w.teamId).orderBy(sql `count(*) desc`);
        const teamId = teams[0].id;
        const report: any = { teamId, tables: {}, queries: {} };
        const filterMeal = (await db.select({ meal: r.recipeBookId }).from(r).where(sql `${r.recipeBookId} is not null`).limit(1))[0].meal!;
        for (const table of ['recipes', 'weeks', 'week_recipes', 'recipe_books'])
            report.tables[table] = (await binding.prepare(`select count(*) n from ${table}`).first<any>()).n;
        async function benchmark({ name, run }: {
            name: string;
            run: () => Promise<unknown>;
        }) {
            const times = [];
            for (let i = 0; i < 15; i++) {
                const start = performance.now();
                await run();
                times.push(performance.now() - start);
            }
            times.sort((a, b) => a - b);
            report.timings ??= {};
            report.timings[name] = { median: times[7], p90: times[13] };
        }
        async function measure({ name, query }: {
            name: string;
            query: {
                toSQL(): {
                    sql: string;
                    params: unknown[];
                };
            };
        }) {
            const { sql: statement, params } = query.toSQL();
            const plan = await binding.prepare('EXPLAIN QUERY PLAN ' + statement).bind(...params).all();
            const timings = [];
            for (let i = 0; i < 15; i++) {
                const start = performance.now();
                const data = await binding.prepare(statement).bind(...params).all();
                JSON.stringify(data.results);
                timings.push(performance.now() - start);
            }
            timings.sort((a, b) => a - b);
            const result = await binding.prepare(statement).bind(...params).all();
            report.queries[name] = { sql: statement, params, timingMs: { median: timings[7], p90: timings[13] }, plan: plan.results, meta: result.meta, rows: result.results.length, bytes: Buffer.byteLength(JSON.stringify(result.results)) };
        }
        for (const search of ['', 'chicken', 'chicken rice', '@filter']) {
            const where = and(or(eq(r.teamId, teamId), eq(r.visibility, 'public')), search === '@filter' ? eq(r.recipeBookId, filterMeal) : undefined, ...(search === '@filter' ? '' : search).split(' ').filter(Boolean).map(term => or(sql `LOWER(${r.name}) LIKE ${'%' + term + '%'}`, sql `LOWER(json_extract(${r.tags}, '$')) LIKE ${'%' + term + '%'}`)));
            const old = db.select({ recipe: r, weekCount: sql<number> `count(distinct case when ${w.teamId} = ${teamId} then ${wr.weekId} end)`,
                latestWeekId: sql<string> `(select ${w.id} from ${wr} inner join ${w} on ${w.id} = ${wr.weekId} where ${wr.recipeId} = ${r.id} and ${w.teamId} = ${teamId} order by ${w.startDate} desc limit 1)`,
                latestWeekName: sql<string> `(select ${w.name} from ${wr} inner join ${w} on ${w.id} = ${wr.weekId} where ${wr.recipeId} = ${r.id} and ${w.teamId} = ${teamId} order by ${w.startDate} desc limit 1)`
            }).from(r).leftJoin(wr, eq(r.id, wr.recipeId)).leftJoin(w, eq(wr.weekId, w.id)).where(where).groupBy(r.id);
            await measure({
                name: 'recipes before ' + search,
                query: old
            });
            const candidates = db.select(recipeListColumns).from(r).where(where).orderBy(r.id);
            await measure({
                name: 'recipes candidates ' + search,
                query: candidates
            });
            const rows = await candidates;
            const statsQuery = recipeScheduleStatsQuery({ db, teamId, recipeIds: rows.map(x => x.id) });
            await measure({
                name: 'recipes stats ' + search,
                query: statsQuery
            });
            const stats = await statsQuery;
            const byId = new Map(stats.map(x => [x.recipeId, x]));
            const before = (await old).map(x => ({ ...x.recipe, mealsEatenCount: x.weekCount, latestWeekId: x.latestWeekId, latestWeekName: x.latestWeekName }));
            const after = rows.map(x => ({ ...x, mealsEatenCount: byId.get(x.id)?.weekCount ?? 0, latestWeekId: byId.get(x.id)?.latestWeekId ?? null, latestWeekName: byId.get(x.id)?.latestWeekName ?? null }));
            for (const item of after) {
                const prev = before.find(x => x.id === item.id)!;
                assert.equal(item.mealsEatenCount, prev.mealsEatenCount);
                assert.equal(item.latestWeekId, prev.latestWeekId);
            }
            report.queries['recipes before ' + search].responseBytes = Buffer.byteLength(JSON.stringify(before));
            report.queries['recipes candidates ' + search].responseBytes = Buffer.byteLength(JSON.stringify(after));
            await benchmark({ name: 'recipes before ' + search, run: async () => JSON.stringify(await old) });
            await benchmark({ name: 'recipes paged ' + search, run: async () => {
                    const candidates = await db.select({ id: r.id, name: r.name, createdAt: r.createdAt }).from(r).where(where).orderBy(r.id);
                    candidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.name.localeCompare(b.name));
                    const ids = candidates.slice(0, 20).map(x => x.id);
                    const [details, stats] = await Promise.all([
                        db.select(recipeListColumns).from(r).where(sql `${r.id} in (select value from json_each(${JSON.stringify(ids)}))`),
                        recipeScheduleStatsQuery({ db, teamId, recipeIds: ids })
                    ]);
                    const byId = new Map(stats.map(x => [x.recipeId, x]));
                    return JSON.stringify(details.map(x => ({ ...x, mealsEatenCount: byId.get(x.id)?.weekCount ?? 0, latestWeekId: byId.get(x.id)?.latestWeekId ?? null, latestWeekName: byId.get(x.id)?.latestWeekName ?? null })));
                } });
        }
        await measure({
            name: 'weeks before',
            query: db.query.weeksTable.findMany({ where: eq(w.teamId, teamId), orderBy: [desc(w.startDate)], columns: { id: true, name: true, emoji: true, status: true }, with: { recipes: { columns: { id: true }, with: { recipe: { columns: { id: true, name: true, emoji: true } } }, orderBy: [asc(wr.order)] } } })
        });
        await measure({
            name: 'weeks after parents',
            query: db.select({ id: w.id, name: w.name, emoji: w.emoji, status: w.status }).from(w).where(eq(w.teamId, teamId)).orderBy(desc(w.startDate))
        });
        await measure({
            name: 'weeks after recipes',
            query: db.select({ weekId: wr.weekId, id: wr.id, recipe: { id: r.id, name: r.name, emoji: r.emoji } }).from(w).innerJoin(wr, eq(wr.weekId, w.id)).innerJoin(r, eq(r.id, wr.recipeId)).where(eq(w.teamId, teamId)).orderBy(asc(wr.order))
        });
        const booksWhere = or(eq(b.teamId, teamId), isNull(b.teamId));
        await measure({
            name: 'books before',
            query: db.query.recipeBooksTable.findMany({ where: booksWhere, with: { recipes: { columns: { id: true }, where: eq(r.teamId, teamId) } } })
        });
        const counts = db.select({ recipeBookId: r.recipeBookId, recipeCount: sql<number> `count(*)`.as('recipeCount') }).from(r).where(eq(r.teamId, teamId)).groupBy(r.recipeBookId).as('recipeCounts');
        await measure({
            name: 'books after',
            query: db.select({ ...getTableColumns(b), recipeCount: sql `coalesce(${counts.recipeCount},0)` }).from(b).leftJoin(counts, eq(counts.recipeBookId, b.id)).where(booksWhere)
        });
        const beforeBooks = await db.query.recipeBooksTable.findMany({ where: booksWhere, with: { recipes: { columns: { id: true }, where: eq(r.teamId, teamId) } } });
        const afterBooks = await db.select({ id: b.id, recipeCount: sql<number> `coalesce(${counts.recipeCount},0)` }).from(b).leftJoin(counts, eq(counts.recipeBookId, b.id)).where(booksWhere);
        assert.deepEqual(afterBooks, beforeBooks.map(x => ({ id: x.id, recipeCount: x.recipes.length })));
        const visible = or(eq(r.teamId, teamId), eq(r.visibility, 'public'));
        await measure({
            name: 'metadata before',
            query: db.select({ mealType: r.mealType, difficulty: r.difficulty, tags: r.tags }).from(r).where(visible)
        });
        const metadata = sql `with visible as materialized (select mealType, difficulty, tags from ${r} where ${visible})
 select 'mealType' as kind, mealType as value from visible where mealType != ''
 union select 'difficulty', difficulty from visible where difficulty != ''
 union select 'tag', value from visible, json_each(visible.tags) where value != ''`;
        const compiled = new SQLiteSyncDialect().sqlToQuery(metadata);
        await measure({
            name: 'metadata after',
            query: { toSQL: () => compiled }
        });
        await benchmark({ name: 'tag options before', run: async () => {
                const rows = await db.select({ mealType: r.mealType, difficulty: r.difficulty, tags: r.tags }).from(r).where(visible);
                return JSON.stringify({ mealTypes: [...new Set(rows.map(x => x.mealType).filter(Boolean))].sort(), difficulties: [...new Set(rows.map(x => x.difficulty).filter(Boolean))].sort(), tags: [...new Set(rows.flatMap(x => x.tags ?? []))].sort() });
            } });
        await benchmark({ name: 'tag options after', run: async () => JSON.stringify(await db.all(metadata)) });
        for (const filter of ['', '@filter', 'chicken']) {
            const where = and(visible, filter === '@filter' ? eq(r.recipeBookId, filterMeal) : filter ? or(sql `LOWER(${r.name}) LIKE ${'%' + filter + '%'}`, sql `LOWER(json_extract(${r.tags}, '$')) LIKE ${'%' + filter + '%'}`) : undefined);
            const candidateQuery = db.select({ id: r.id, name: r.name, createdAt: r.createdAt }).from(r).where(where).orderBy(r.id);
            await measure({
                name: 'paged candidates ' + filter,
                query: candidateQuery
            });
            const candidates = await candidateQuery;
            candidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.name.localeCompare(b.name));
            const ids = candidates.slice(0, 20).map(x => x.id);
            const pageQuery = db.select(recipeListColumns).from(r).where(sql `${r.id} in (select value from json_each(${JSON.stringify(ids)}))`);
            const statsQuery = recipeScheduleStatsQuery({ db, teamId, recipeIds: ids });
            await measure({
                name: 'paged details ' + filter,
                query: pageQuery
            });
            await measure({
                name: 'paged stats ' + filter,
                query: statsQuery
            });
            const [pageRows, stats] = await Promise.all([pageQuery, statsQuery]);
            const byId = new Map(stats.map(x => [x.recipeId, x]));
            const response = pageRows.map(x => ({ ...x, mealsEatenCount: byId.get(x.id)?.weekCount ?? 0, latestWeekId: byId.get(x.id)?.latestWeekId ?? null, latestWeekName: byId.get(x.id)?.latestWeekName ?? null }));
            report.queries['paged details ' + filter].responseBytes = Buffer.byteLength(JSON.stringify(response));
        }
        writeFileSync('/tmp/web-list-measurements.json', JSON.stringify(report, null, 2));
        for (const [name, q] of Object.entries<any>(report.queries))
            console.log(name, JSON.stringify({ rows: q.rows, bytes: q.bytes, responseBytes: q.responseBytes, meta: q.meta, plan: q.plan.map((p: any) => p.detail) }));
    }
    finally {
        await proxy.dispose();
    }
}
main();
