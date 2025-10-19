-- Default grocery list template
-- Generated: 2025-10-17T21:57:49.803Z

-- Check if template already exists and delete it
DELETE FROM grocery_list_templates WHERE id = 'glt_default';

-- Insert default template
INSERT INTO grocery_list_templates (id, name, isDefault, teamId, template, createdAt, updatedAt)
SELECT
  'glt_default',
  'Default Grocery List',
  1,
  'team_default',
  '[{"category":"Meat","order":0,"items":[{"name":"eggs","order":0},{"name":"bacon","order":1}]},{"category":"Veggies / Herbs","order":1,"items":[{"name":"garlic","order":0},{"name":"onions","order":1}]},{"category":"Liquids","order":2,"items":[]},{"category":"Costco","order":3,"items":[{"name":"sparkling water","order":0},{"name":"sauerkraut","order":1}]},{"category":"Misc","order":4,"items":[]}]',
  strftime('%s', 'now'),
  strftime('%s', 'now');
