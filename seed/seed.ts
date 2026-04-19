import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEMO_EMAIL    = 'a@a.com';
const DEMO_PASSWORD = '123412341234';

const AUTH_URL   = process.env.AUTH_URL   ?? 'http://localhost:8080';
const BUDGET_URL = process.env.BUDGET_URL ?? 'http://localhost:8082';
const JOBS_URL   = process.env.JOBS_URL   ?? 'http://localhost:8083';
const GQL_URL    = process.env.GQL_URL    ?? 'http://localhost:4000';

const STATE_FILE = path.join(__dirname, 'seed-state.json');

// ---------------------------------------------------------------------------
// Seeded RNG — deterministic so the same transactions are generated each run
// ---------------------------------------------------------------------------

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 0x1 | s);
    s ^= s + Math.imul(s ^ (s >>> 7), 61 | s);
    return ((s ^ (s >>> 14)) >>> 0) / 0xffffffff;
  };
}

let _rng = makeRng(42);

function randInt(min: number, max: number): number {
  return Math.floor(_rng() * (max - min + 1)) + min;
}

function randPick<T>(arr: T[]): T {
  return arr[Math.floor(_rng() * arr.length)];
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function post(url: string, body: unknown, token?: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${url} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function del(url: string, token: string): Promise<void> {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`DELETE ${url} → ${res.status}: ${text}`);
  }
}

async function gql<T = any>(query: string, variables: Record<string, any>, token: string): Promise<T> {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GQL → ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`GQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// State — module-level, written to disk after every successful creation
// ---------------------------------------------------------------------------

type SeedState = {
  userId: string;
  budget: { accountIds: string[]; categoryIds: string[]; billIds: string[]; transactionIds: string[] };
  jobSearch: { recruiterIds: string[]; jobIds: string[] };
  homeMaintenance: {
    vehicleIds: string[]; serviceRecordIds: string[];
    homeIds: string[]; homeTaskIds: string[]; homeCompletionIds: string[];
  };
  recipes: { recipeIds: string[] };
  projects: { projectIds: string[]; taskIds: string[] };
};

function emptyState(): SeedState {
  return {
    userId: '',
    budget: { accountIds: [], categoryIds: [], billIds: [], transactionIds: [] },
    jobSearch: { recruiterIds: [], jobIds: [] },
    homeMaintenance: { vehicleIds: [], serviceRecordIds: [], homeIds: [], homeTaskIds: [], homeCompletionIds: [] },
    recipes: { recipeIds: [] },
    projects: { projectIds: [], taskIds: [] },
  };
}

let state: SeedState = emptyState();

function loadState(): SeedState | null {
  if (!fs.existsSync(STATE_FILE)) return null;
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function setupUser(): Promise<{ userId: string; token: string }> {
  try {
    const res = await post(`${AUTH_URL}/users/login`, { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    console.log('  Logged in as demo user');
    return { userId: res.user.id, token: res.accessToken };
  } catch {
    await post(`${AUTH_URL}/users/register`, { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    const res = await post(`${AUTH_URL}/users/login`, { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    console.log('  Registered and logged in as demo user');
    return { userId: res.user.id, token: res.accessToken };
  }
}

// ---------------------------------------------------------------------------
// Reset helpers
// ---------------------------------------------------------------------------

async function resetBudget(saved: SeedState, token: string) {
  console.log('  Deleting budget transactions...');
  for (const id of saved.budget.transactionIds) {
    await del(`${BUDGET_URL}/transactions/${id}`, token);
  }
  console.log('  Deleting bills...');
  for (const id of saved.budget.billIds) {
    await del(`${BUDGET_URL}/bills/${id}`, token);
  }
  console.log('  Deleting accounts...');
  for (const id of saved.budget.accountIds) {
    await del(`${BUDGET_URL}/accounts/${id}`, token);
  }
  console.log('  Deleting categories...');
  for (const id of saved.budget.categoryIds) {
    await del(`${BUDGET_URL}/categories/${id}`, token);
  }
}

async function resetJobSearch(saved: SeedState, token: string) {
  console.log('  Deleting jobs...');
  for (const id of saved.jobSearch.jobIds) {
    await del(`${JOBS_URL}/jobs/${id}`, token);
  }
  console.log('  Deleting recruiters...');
  for (const id of saved.jobSearch.recruiterIds) {
    await del(`${JOBS_URL}/recruiters/${id}`, token);
  }
}

async function resetHomeMaintenance(saved: SeedState, token: string) {
  const DELETE_HOME_COMPLETION = `mutation DeleteHomeCompletion($id: String!) { deleteHomeCompletion(id: $id) { deletedCount } }`;
  const DELETE_HOME_TASK       = `mutation DeleteHomeTask($id: String!)       { deleteHomeTask(id: $id) { deletedCount } }`;
  const DELETE_HOME            = `mutation DeleteHome($id: String!)            { deleteHome(id: $id) { deletedCount } }`;
  const DELETE_SERVICE_RECORD  = `mutation DeleteServiceRecord($id: String!)  { deleteServiceRecord(id: $id) { deletedCount } }`;
  const DELETE_VEHICLE         = `mutation DeleteVehicle($id: String!)        { deleteVehicle(id: $id) { deletedCount } }`;

  console.log('  Deleting home completions...');
  for (const id of saved.homeMaintenance.homeCompletionIds) {
    await gql(DELETE_HOME_COMPLETION, { id }, token);
  }
  console.log('  Deleting home tasks...');
  for (const id of saved.homeMaintenance.homeTaskIds) {
    await gql(DELETE_HOME_TASK, { id }, token);
  }
  console.log('  Deleting homes...');
  for (const id of saved.homeMaintenance.homeIds) {
    await gql(DELETE_HOME, { id }, token);
  }
  console.log('  Deleting service records...');
  for (const id of saved.homeMaintenance.serviceRecordIds) {
    await gql(DELETE_SERVICE_RECORD, { id }, token);
  }
  console.log('  Deleting vehicles...');
  for (const id of saved.homeMaintenance.vehicleIds) {
    await gql(DELETE_VEHICLE, { id }, token);
  }
}

async function resetRecipes(saved: SeedState, token: string) {
  const DELETE_RECIPE = `mutation DeleteRecipe($id: String!) { deleteRecipe(id: $id) { deletedCount } }`;
  console.log('  Deleting recipes...');
  for (const id of saved.recipes.recipeIds) {
    await gql(DELETE_RECIPE, { id }, token);
  }
}

async function resetProjects(saved: SeedState, token: string) {
  const DELETE_TASK    = `mutation DeleteTask($id: String!)    { deleteTask(id: $id) { deletedCount } }`;
  const DELETE_PROJECT = `mutation DeleteProject($id: String!) { deleteProject(id: $id) { deletedCount } }`;
  console.log('  Deleting tasks...');
  for (const id of saved.projects.taskIds) {
    await gql(DELETE_TASK, { id }, token);
  }
  console.log('  Deleting projects...');
  for (const id of saved.projects.projectIds) {
    await gql(DELETE_PROJECT, { id }, token);
  }
}

// ---------------------------------------------------------------------------
// Seed: Budget
// ---------------------------------------------------------------------------

async function seedBudget(token: string) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/budget.json'), 'utf8'));
  _rng = makeRng(data.transactionConfig.randomSeed ?? 42);

  const accountMap: Record<string, { id: string; owner: string }> = {};

  console.log('  Creating accounts...');
  for (const a of data.accounts) {
    const created = await post(`${BUDGET_URL}/accounts`, {
      name: a.name, description: a.description, balance: a.balance, owner: a.owner, type: a.type,
    }, token);
    state.budget.accountIds.push(created.id);
    saveState();
    const key = `${a.owner}-${a.type}`;
    if (!accountMap[key]) accountMap[key] = { id: created.id, owner: a.owner };
    accountMap[`${a.owner}-${a.name}`] = { id: created.id, owner: a.owner };
  }

  const allAccounts: { id: string; owner: string }[] = data.accounts.map((a: any, i: number) => ({ ...a, id: state.budget.accountIds[i] }));

  const categoryMap: Record<string, string> = {};
  console.log('  Creating categories...');
  for (const c of data.categories) {
    const created = await post(`${BUDGET_URL}/categories`, { name: c.name, description: c.description }, token);
    state.budget.categoryIds.push(created.id);
    saveState();
    categoryMap[c.name] = created.id;
  }

  const billAmountMap: Record<string, number> = {};
  const billDueDayMap: Record<string, number> = {};
  console.log('  Creating bills...');
  for (const b of data.bills) {
    const sourceId = accountMap[`${b.accountOwner}-asset`]?.id;
    if (!sourceId) throw new Error(`No asset account found for owner ${b.accountOwner}`);
    const created = await post(`${BUDGET_URL}/bills`, {
      name: b.name, description: b.description, sourceId, dueDay: b.dueDay, owner: b.owner,
    }, token);
    state.budget.billIds.push(created.id);
    saveState();
    billAmountMap[created.id] = b.amount;
    billDueDayMap[created.id] = b.dueDay;
  }

  console.log('  Creating bill payment history...');
  const today = new Date();
  const months: string[] = [];
  for (let i = data.transactionConfig.months; i >= 1; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  for (const billId of state.budget.billIds) {
    for (const month of months) {
      const [year, mon] = month.split('-').map(Number);
      const dueDay = billDueDayMap[billId] ?? 1;
      const payDate = `${year}-${String(mon).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
      const txn = await post(`${BUDGET_URL}/bills/${billId}/pay`, {
        amount: billAmountMap[billId],
        billMonth: month,
        date: payDate,
        description: '',
      }, token);
      state.budget.transactionIds.push(txn.id);
      saveState();
    }
  }

  console.log('  Creating category transactions...');
  const cfg = data.transactionConfig;

  console.log('  Creating income transactions...');
  const incomeCfg = cfg.income as Record<string, { days: number[]; minAmount: number; maxAmount: number }>;
  for (const month of months) {
    const [year, mon] = month.split('-').map(Number);
    for (const [owner, ic] of Object.entries(incomeCfg)) {
      const checkingId = accountMap[`${owner}-asset`]?.id;
      if (!checkingId) throw new Error(`No asset account found for owner ${owner}`);
      for (const day of ic.days) {
        const txn = await post(`${BUDGET_URL}/transactions`, {
          destinationId: checkingId,
          amount:        randInt(ic.minAmount, ic.maxAmount),
          date:          `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          description:   '',
          income:        true,
          owner,
          shared:        false,
          type:          'income',
        }, token);
        state.budget.transactionIds.push(txn.id);
        saveState();
      }
    }
  }
  const categoryDefs = [
    { catId: categoryMap['Food'],  ...cfg.food  },
    { catId: categoryMap['Gas'],   ...cfg.gas   },
    { catId: categoryMap['Other'], ...cfg.other },
  ];

  for (const month of months) {
    const [year, mon] = month.split('-').map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();

    for (const cat of categoryDefs) {
      const count = randInt(cat.minCount, cat.maxCount);
      for (let i = 0; i < count; i++) {
        const account = randPick(allAccounts);
        const day = randInt(1, daysInMonth);
        const txn = await post(`${BUDGET_URL}/transactions`, {
          sourceId:    account.id,
          categoryId:  cat.catId,
          amount:      randInt(cat.minAmount, cat.maxAmount),
          date:        `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          description: '',
          income:      false,
          owner:       account.owner,
          shared:      false,
          type:        'expense',
        }, token);
        state.budget.transactionIds.push(txn.id);
        saveState();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Seed: Job Search
// ---------------------------------------------------------------------------

async function seedJobSearch(token: string) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/job-search.json'), 'utf8'));
  const recruiterMap: Record<string, string> = {};

  console.log('  Creating recruiters...');
  for (const r of data.recruiters) {
    const created = await post(`${JOBS_URL}/recruiters`, {
      name: r.name, company: r.company, phone: r.phone, email: r.email, rating: r.rating,
    }, token);
    state.jobSearch.recruiterIds.push(created.id);
    saveState();
    recruiterMap[r.name] = created.id;
  }

  console.log('  Creating jobs...');
  for (const j of data.jobs) {
    const recruiterId = recruiterMap[j.recruiterName];
    if (!recruiterId) throw new Error(`Unknown recruiter: ${j.recruiterName}`);
    const created = await post(`${JOBS_URL}/jobs`, {
      recruiterId,
      jobTitle:     j.jobTitle,
      companyName:  j.companyName,
      workFrom:     j.workFrom,
      dateApplied:  j.dateApplied,
      companyCity:  j.companyCity,
      companyState: j.companyState,
      status:       j.status,
    }, token);
    state.jobSearch.jobIds.push(created.id);
    saveState();
  }
}

// ---------------------------------------------------------------------------
// Seed: Home Maintenance (GraphQL)
// ---------------------------------------------------------------------------

async function seedHomeMaintenance(token: string) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/home-maintenance.json'), 'utf8'));

  const CREATE_VEHICLE = `
    mutation CreateVehicle($year: Float!, $make: String!, $model: String!, $mileage: Float!, $color: String, $trim: String, $plate: String) {
      createVehicle(year: $year, make: $make, model: $model, mileage: $mileage, color: $color, trim: $trim, plate: $plate) {
        id
      }
    }
  `;

  // ServiceRecordType is inlined — Apollo Router won't coerce JSON strings to enum variables
  const makeCreateServiceRecord = (type: string) => `
    mutation CreateServiceRecord($vehicleId: String!, $date: String!, $mileage: Float!, $cost: Float, $name: String, $description: String) {
      createServiceRecord(vehicleId: $vehicleId, type: ${type}, date: $date, mileage: $mileage, cost: $cost, name: $name, description: $description) {
        id
      }
    }
  `;

  const CREATE_HOME = `
    mutation CreateHome($address: String!, $yearBuilt: Float, $sqFootage: Float, $notes: String) {
      createHome(address: $address, yearBuilt: $yearBuilt, sqFootage: $sqFootage, notes: $notes) {
        id
      }
    }
  `;

  // HomeTaskFrequency is inlined — same Apollo Router enum coercion restriction
  const makeCreateHomeTask = (frequency: string) => `
    mutation CreateHomeTask($homeId: String!, $name: String!, $description: String) {
      createHomeTask(homeId: $homeId, name: $name, frequency: ${frequency}, description: $description) {
        id
      }
    }
  `;

  const CREATE_HOME_COMPLETION = `
    mutation CreateHomeCompletion($taskId: String!, $date: String!, $cost: Float, $notes: String) {
      createHomeCompletion(taskId: $taskId, date: $date, cost: $cost, notes: $notes) {
        id
      }
    }
  `;

  console.log('  Creating vehicles and service records...');
  for (const v of data.vehicles) {
    const vehicle = await gql<any>(CREATE_VEHICLE, {
      year: v.year, make: v.make, model: v.model, mileage: v.mileage,
      color: v.color, trim: v.trim, plate: v.plate,
    }, token);
    const vehicleId = vehicle.createVehicle.id;
    state.homeMaintenance.vehicleIds.push(vehicleId);
    saveState();

    for (const sr of v.serviceRecords) {
      const record = await gql<any>(makeCreateServiceRecord(sr.type), {
        vehicleId, date: sr.date, mileage: sr.mileage,
        cost: sr.cost ?? null, name: sr.name ?? null, description: sr.description || null,
      }, token);
      state.homeMaintenance.serviceRecordIds.push(record.createServiceRecord.id);
      saveState();
    }
  }

  console.log('  Creating homes, tasks, and completions...');
  for (const h of data.homes) {
    const home = await gql<any>(CREATE_HOME, {
      address: h.address, yearBuilt: h.yearBuilt, sqFootage: h.sqFootage, notes: h.notes,
    }, token);
    const homeId = home.createHome.id;
    state.homeMaintenance.homeIds.push(homeId);
    saveState();

    const taskIds: string[] = [];
    for (const t of h.tasks) {
      const task = await gql<any>(makeCreateHomeTask(t.frequency), {
        homeId, name: t.name, description: t.description || null,
      }, token);
      const taskId = task.createHomeTask.id;
      state.homeMaintenance.homeTaskIds.push(taskId);
      saveState();
      taskIds.push(taskId);
    }

    for (const c of h.completions) {
      const taskId = taskIds[c.taskIndex];
      if (!taskId) throw new Error(`No task at index ${c.taskIndex}`);
      const completion = await gql<any>(CREATE_HOME_COMPLETION, {
        taskId, date: c.date, cost: c.cost ?? null, notes: c.notes || null,
      }, token);
      state.homeMaintenance.homeCompletionIds.push(completion.createHomeCompletion.id);
      saveState();
    }
  }
}

// ---------------------------------------------------------------------------
// Seed: Recipes (GraphQL)
// ---------------------------------------------------------------------------

async function seedRecipes(token: string) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/recipes.json'), 'utf8'));

  const CREATE_RECIPE = `
    mutation CreateRecipe(
      $name: String!, $ingredients: [String!]!, $directions: [String!]!,
      $description: String, $prepTime: Float, $cookTime: Float, $servings: Float, $tags: [String!]
    ) {
      createRecipe(
        name: $name, ingredients: $ingredients, directions: $directions,
        description: $description, prepTime: $prepTime, cookTime: $cookTime, servings: $servings, tags: $tags
      ) {
        id
      }
    }
  `;

  console.log('  Creating recipes...');
  for (const r of data.recipes) {
    const recipe = await gql<any>(CREATE_RECIPE, {
      name: r.name, ingredients: r.ingredients, directions: r.directions,
      description: r.description ?? null, prepTime: r.prepTime ?? null,
      cookTime: r.cookTime ?? null, servings: r.servings ?? null, tags: r.tags ?? null,
    }, token);
    state.recipes.recipeIds.push(recipe.createRecipe.id);
    saveState();
  }
}

// ---------------------------------------------------------------------------
// Seed: Projects (GraphQL)
// ---------------------------------------------------------------------------

async function seedProjects(token: string) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/projects.json'), 'utf8'));

  const CREATE_PROJECT = `
    mutation CreateProject($name: String!, $description: String, $status: ProjectStatus, $dueDate: String) {
      createProject(name: $name, description: $description, status: $status, dueDate: $dueDate) {
        id
      }
    }
  `;

  const CREATE_TASK = `
    mutation CreateTask($projectId: String!, $name: String!, $description: String, $status: TaskStatus, $dueDate: String) {
      createTask(projectId: $projectId, name: $name, description: $description, status: $status, dueDate: $dueDate) {
        id
      }
    }
  `;

  console.log('  Creating projects and tasks...');
  for (const p of data.projects) {
    const project = await gql<any>(CREATE_PROJECT, {
      name: p.name, description: p.description ?? null,
      status: p.status ?? null, dueDate: p.dueDate ?? null,
    }, token);
    const projectId = project.createProject.id;
    state.projects.projectIds.push(projectId);
    saveState();

    for (const t of p.tasks) {
      const task = await gql<any>(CREATE_TASK, {
        projectId, name: t.name, description: t.description || null,
        status: t.status ?? null, dueDate: t.dueDate ?? null,
      }, token);
      state.projects.taskIds.push(task.createTask.id);
      saveState();
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const reset = process.argv.includes('--reset');

  console.log(`\npe-seed — ${reset ? 'RESET + seed' : 'seed'}\n`);

  console.log('Auth...');
  const { userId, token } = await setupUser();

  if (reset) {
    const saved = loadState();
    if (!saved) {
      console.log('No seed-state.json found — nothing to reset. Seeding fresh.\n');
    } else {
      console.log('\nResetting previously seeded data...');
      await resetBudget(saved, token);
      await resetJobSearch(saved, token);
      await resetHomeMaintenance(saved, token);
      await resetRecipes(saved, token);
      await resetProjects(saved, token);
      console.log('Reset complete.\n');
    }
  }

  state = emptyState();
  state.userId = userId;
  saveState();

  console.log('Seeding budget...');
  await seedBudget(token);

  console.log('\nSeeding job search...');
  await seedJobSearch(token);

  console.log('\nSeeding home maintenance...');
  await seedHomeMaintenance(token);

  console.log('\nSeeding recipes...');
  await seedRecipes(token);

  console.log('\nSeeding projects...');
  await seedProjects(token);

  console.log('\nDone.');
  console.log(`  Budget:      ${state.budget.accountIds.length} accounts, ${state.budget.categoryIds.length} categories, ${state.budget.billIds.length} bills, ${state.budget.transactionIds.length} transactions`);
  console.log(`  Job search:  ${state.jobSearch.recruiterIds.length} recruiters, ${state.jobSearch.jobIds.length} jobs`);
  console.log(`  Home maint:  ${state.homeMaintenance.vehicleIds.length} vehicles, ${state.homeMaintenance.serviceRecordIds.length} service records, ${state.homeMaintenance.homeIds.length} homes, ${state.homeMaintenance.homeTaskIds.length} tasks, ${state.homeMaintenance.homeCompletionIds.length} completions`);
  console.log(`  Recipes:     ${state.recipes.recipeIds.length}`);
  console.log(`  Projects:    ${state.projects.projectIds.length} projects, ${state.projects.taskIds.length} tasks\n`);
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
