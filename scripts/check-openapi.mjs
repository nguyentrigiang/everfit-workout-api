// Checks the OpenAPI document of a running, built app (Swagger CLI plugin applied).
// Tests run without the plugin, so they cannot see DTO-derived schemas; this can.
// Usage: npm run docs:check   (BASE_URL defaults to http://localhost:3000)
const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
const doc = await (await fetch(`${baseUrl}/docs-json`)).json();
const problems = [];
const expect = (ok, message) => ok || problems.push(message);

const history = doc.paths['/api/v1/users/{userId}/workouts']?.get;
const records = doc.paths['/api/v1/users/{userId}/records']?.get;
const param = (op, name) => op?.parameters?.find((p) => p.name === name);

for (const name of [
  'exercise',
  'muscleGroup',
  'from',
  'to',
  'unit',
  'limit',
  'cursor',
]) {
  expect(param(history, name), `history is missing query param "${name}"`);
}
for (const name of [
  'exercise',
  'from',
  'to',
  'compareFrom',
  'compareTo',
  'unit',
]) {
  expect(param(records, name), `records is missing query param "${name}"`);
}
expect(
  param(history, 'limit')?.required !== true,
  'history "limit" must be optional',
);
expect(
  param(records, 'exercise')?.required === true,
  'records "exercise" must be required',
);
expect(
  param(history, 'from')?.schema?.format === 'date',
  'history "from" must have format date',
);

const schemas = doc.components.schemas;
expect(
  schemas.LogWorkoutsDto?.properties?.entries?.maxItems === 100,
  'entries must document maxItems 100',
);
expect(
  schemas.WorkoutEntryDto?.properties?.sets?.maxItems === 50,
  'sets must document maxItems 50',
);
expect(
  schemas.WorkoutSetDto?.properties?.reps?.type === 'integer',
  'reps must be an integer',
);
expect(
  doc.paths['/api/v1/users/{userId}/workouts']?.post?.responses?.['413'],
  'POST workouts must document 413',
);

if (problems.length > 0) {
  console.error(`OpenAPI check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('OpenAPI check passed');
