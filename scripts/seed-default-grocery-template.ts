import * as fs from 'fs';

function escapeSQL(value: string): string {
  return value.replace(/'/g, "''");
}

function generateDefaultTemplateSQL() {
  // Create the default template based on the Notion template
  const defaultTemplate = [
    {
      category: "Meat",
      order: 0,
      items: [
        { name: "eggs", order: 0 },
        { name: "bacon", order: 1 },
      ],
    },
    {
      category: "Veggies / Herbs",
      order: 1,
      items: [
        { name: "garlic", order: 0 },
        { name: "onions", order: 1 },
      ],
    },
    {
      category: "Liquids",
      order: 2,
      items: [],
    },
    {
      category: "Costco",
      order: 3,
      items: [
        { name: "sparkling water", order: 0 },
        { name: "sauerkraut", order: 1 },
      ],
    },
    {
      category: "Misc",
      order: 4,
      items: [],
    },
  ];

  const now = Date.now();
  const templateId = 'glt_default';
  const name = escapeSQL('Default Grocery List');
  const templateJson = escapeSQL(JSON.stringify(defaultTemplate));

  const sqlStatements = [
    '-- Default grocery list template',
    `-- Generated: ${new Date().toISOString()}`,
    '',
    '-- Check if template already exists and delete it',
    `DELETE FROM grocery_list_templates WHERE id = '${templateId}';`,
    '',
    '-- Insert default template',
    `INSERT INTO grocery_list_templates (id, name, template, createdAt, updatedAt)`,
    `VALUES ('${templateId}', '${name}', '${templateJson}', ${now}, ${now});`,
    '',
  ];

  return sqlStatements.join('\n');
}

const sql = generateDefaultTemplateSQL();
const outputPath = './src/db/grocery-template-seed.sql';
fs.writeFileSync(outputPath, sql, 'utf-8');

console.log(`✅ Successfully generated ${outputPath}`);
console.log(`   Run: pnpm db:seed:template:local`);
