-- Seed data for recipes and recipe books
-- Generated from Notion (via Food Schedule relations)
-- Date: 2025-10-17T20:10:29.779Z
-- Note: Recipe IDs are Notion page IDs

-- Recipe books
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_1', 'Half Baked Harvest - Super Simple', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_2', 'Ready Or Not - Nom Nom Paleo', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_3', 'Primal Cravings', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_4', 'Asian Paleo', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_5', 'Sourdough Every Day', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_6', 'Nom Nom Paleo', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_7', 'Let’s Go - Nom Nom', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_8', 'The Homegrown Paleo', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_9', 'Nutrient Dense Meal Prep', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_10', 'Truly Crunchy Magazine - Winter', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_11', 'Healthy in a hurry', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_12', 'Simple Thai Food', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_13', 'Salt Fat Acid Heat', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_14', 'The First Forty Days', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_15', 'Eat to Feed', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_16', 'Magnolia table vol. 2', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_17', 'Sous Vide Made Simple', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_18', 'Restorative traditions', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_19', 'How to grill', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_20', 'Toddler to Table', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_21', 'Milk to Meals', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_22', 'Histamine Reset Plan', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_23', 'A Healthier Home Cook', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_24', 'Fallon''s Dairy Free Meal Plan', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_25', 'The Microbiome Cookbook', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_26', 'Real Food for Fertility', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_27', 'Chat GPT', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_28', 'Nourashing Traditions', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_29', 'Six Seasons - A New Way with Vegetables', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_30', '101 Asian Dishes', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_31', 'Simple Thai Cooking', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_32', 'Franklin BBQ', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_33', 'Shred Happens So Easy So Good', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_34', 'Nine Golden Months', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_35', 'REAL food for pregnancy', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_36', 'Batch', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_37', 'The Nourishing Asian Kitchen', 1760731829780);
INSERT INTO recipe_books (id, name, createdAt) VALUES ('rb_38', 'To Asia With Love', 1760731829780);

-- Recipes
INSERT INTO recipes (id, name, emoji, tags, mealType, difficulty, recipeLink, recipeBookId, page, lastMadeDate, mealsEatenCount, ingredients, recipeBody, createdAt, updatedAt, updateCounter)
VALUES ('28fde7a2-c4fc-8188-9682-edf0eaca16ea', 'Pizza', '🍕', NULL, 'Dinner', NULL, NULL, NULL, NULL, NULL, 0, '["Sourdough Dough","Chicken Sausage","Red Bell Pepper","Onion","Red Sauce","Almond Mozz Cheese"]', '', 1760731829780, 1760731829780, 0);
INSERT INTO recipes (id, name, emoji, tags, mealType, difficulty, recipeLink, recipeBookId, page, lastMadeDate, mealsEatenCount, ingredients, recipeBody, createdAt, updatedAt, updateCounter)
VALUES ('28fde7a2-c4fc-811a-b1db-f8f581c945b3', 'NAM TOK THAI GRILLED BEEF WATERFALL SALAD', '🥗', NULL, NULL, NULL, 'https://www.simplysuwanee.com/nam-tok-beef-waterfall-salad/', NULL, NULL, NULL, 0, '["1 lb top sirloin steak","1 tablespoon oil","1 tablespoon ground white pepper","1 tablespoon sugar","1 tablespoon fish sauce","1 tablespoon light soy sauce","2 tablespoon oyster sauce","2 teaspoon lime juice","1 tablespoon garlic, minced (about 2-3 medium cloves)","¼ cup lemongrass, finely minced","⅓ cup shallot, thinly sliced","1 stalk green onions, chopped into ¼-inch pieces","¼ cup cilantro, chopped into ½-inch pieces","¼ cup fresh mint leaves, chopped into 1-inch pieces","1½-2 tablespoon fish sauce","3 tablespoons fresh lime juice","½-2 teaspoons fresh or dry Thai chilis","2 tablespoons toasted rice powder"]', '', 1760731829780, 1760731829780, 0);
INSERT INTO recipes (id, name, emoji, tags, mealType, difficulty, recipeLink, recipeBookId, page, lastMadeDate, mealsEatenCount, ingredients, recipeBody, createdAt, updatedAt, updateCounter)
VALUES ('28fde7a2-c4fc-819e-b7b2-e7f4b038d495', 'Thai Basil Beef w/ Peanut Salsa', '🍔', NULL, NULL, NULL, 'https://www.beyondthekitchendoor.com/recipes/2020/6/15/review-thai-basil-beef-with-peanut-salsa-half-baked-harvest-super-simple', 'rb_1', '213', NULL, 0, '["Rice","2 tbsp sesame oil","1 lb ground beef","3 garlic cloves","1 inch piece of fresh ginger (peeled & grated)","1/2 Thai sweet chili sauce","1/2 cup soy sauce","1 cup basil leaves (chopped)","Juice of 2 limes","1/2 cup salted peanuts","1 fresno pepper","3 carrots","2 green onions","mint leaves"]', '', 1760731829780, 1760731829780, 0);