import { DatabaseSync } from "node:sqlite";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { faker } from "@faker-js/faker";
import { toPng } from "jdenticon";

const DB_PATH = fileURLToPath(new URL("../backend/data/arasaka.db", import.meta.url));
const RANDOM_SEED = 2077;
const TODAY = "2026-10-15";
const PHOTO_SIZE = 64;

const FAN_OUT = [8, 6, 6, 4, 3, 2];
const LEVEL_7_MANAGERS = 6912;
const INDIVIDUAL_CONTRIBUTORS = 52135;
const TOTAL_EMPLOYEES = 64000;

const DIVISIONS = [
  "Security",
  "Cyberware",
  "Aerospace",
  "Banking",
  "Media",
  "Intelligence",
  "Research",
  "Corporate Affairs",
];

const IC_TITLES: Record<string, string[]> = {
  Security: ["Security Operative", "Threat Analyst", "Executive Protection Agent"],
  Cyberware: ["Cyberware Engineer", "Neural Interface Technician", "Implant Specialist"],
  Aerospace: ["Flight Systems Engineer", "Orbital Logistics Specialist", "AV Pilot"],
  Banking: ["Financial Analyst", "Risk Analyst", "Account Manager"],
  Media: ["Content Producer", "Brand Strategist", "Broadcast Technician"],
  Intelligence: ["Intelligence Analyst", "Netrunner", "Field Agent"],
  Research: ["Research Scientist", "Lab Technician", "Data Scientist"],
  "Corporate Affairs": ["HR Business Partner", "Legal Counsel", "Communications Specialist"],
};

const MANAGER_TITLES = [
  "Chief Executive Officer",
  "President",
  "Senior Vice President",
  "Vice President",
  "Director",
  "Senior Manager",
  "Manager",
];

const LOCATIONS = ["Tokyo", "Night City", "Osaka", "Kyoto", "Singapore", "Hong Kong", "Berlin", "Seoul"];

const EARLIEST_START_YEAR = [2001, 2003, 2005, 2007, 2009, 2011, 2013, 2015];

interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  level: number;
  division: string;
  location: string;
  managerId: number | null;
  startDate: string;
}

faker.seed(RANDOM_SEED);

const usedEmails = new Set<string>();

const emailFor = (firstName: string, lastName: string) =>
  `${firstName}.${lastName}`
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z.-]/g, "") + "@arasaka.example";

function claimName(firstName: string, lastName: string): string | undefined {
  const email = emailFor(firstName, lastName);
  if (firstName === lastName || usedEmails.has(email)) return undefined;
  usedEmails.add(email);
  return email;
}

function uniqueName(): { firstName: string; lastName: string; email: string } {
  for (;;) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = claimName(firstName, lastName);
    if (email) return { firstName, lastName, email };
  }
}

function startDate(level: number): string {
  return faker.date
    .between({ from: `${EARLIEST_START_YEAR[level - 1]}-01-01`, to: TODAY })
    .toISOString()
    .slice(0, 10);
}

function locationFor(manager: Employee): string {
  return faker.datatype.boolean(0.8) ? manager.location : faker.helpers.arrayElement(LOCATIONS);
}

function titleFor(level: number, division: string): string {
  if (level <= 7) return `${MANAGER_TITLES[level - 1]}, ${division}`;
  const title = faker.helpers.arrayElement(IC_TITLES[division]);
  return faker.datatype.boolean(0.3) ? `Senior ${title}` : title;
}

function createEmployee(id: number, level: number, manager: Employee, division: string): Employee {
  return {
    id,
    ...uniqueName(),
    title: titleFor(level, division),
    level,
    division,
    location: locationFor(manager),
    managerId: manager.id,
    startDate: startDate(level),
  };
}

function createCeo(): Employee {
  return {
    id: 1,
    firstName: "Saburo",
    lastName: "Arasaka",
    email: claimName("Saburo", "Arasaka")!,
    title: MANAGER_TITLES[0],
    level: 1,
    division: "Executive Office",
    location: "Tokyo",
    managerId: null,
    startDate: startDate(1),
  };
}

function individualContributorTeamSize(index: number): number {
  const extra = INDIVIDUAL_CONTRIBUTORS - LEVEL_7_MANAGERS * 7;
  const before = Math.floor((index * extra) / LEVEL_7_MANAGERS);
  const after = Math.floor(((index + 1) * extra) / LEVEL_7_MANAGERS);
  return 7 + (after - before);
}

function generateCompany(): Employee[] {
  const ceo = createCeo();
  const employees = [ceo];
  let currentLevel = [ceo];

  for (let level = 2; level <= 8; level++) {
    const nextLevel: Employee[] = [];
    currentLevel.forEach((manager, index) => {
      const teamSize = level === 8 ? individualContributorTeamSize(index) : FAN_OUT[level - 2];
      for (let i = 0; i < teamSize; i++) {
        const division = level === 2 ? DIVISIONS[i] : manager.division;
        const employee = createEmployee(employees.length + 1, level, manager, division);
        employees.push(employee);
        nextLevel.push(employee);
      }
    });
    currentLevel = nextLevel;
  }

  if (employees.length !== TOTAL_EMPLOYEES) {
    throw new Error(`Expected ${TOTAL_EMPLOYEES} employees, generated ${employees.length}`);
  }
  return employees;
}

function writeDatabase(employees: Employee[]): void {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB_PATH + suffix, { force: true });

  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE employees (
      id          INTEGER PRIMARY KEY,
      first_name  TEXT NOT NULL,
      last_name   TEXT NOT NULL,
      first_lower TEXT NOT NULL,
      last_lower  TEXT NOT NULL,
      email       TEXT NOT NULL UNIQUE,
      title       TEXT NOT NULL,
      level       INTEGER NOT NULL,
      division    TEXT NOT NULL,
      location    TEXT NOT NULL,
      manager_id  INTEGER REFERENCES employees(id),
      start_date  TEXT NOT NULL
    );
    CREATE TABLE photos (
      employee_id INTEGER PRIMARY KEY REFERENCES employees(id),
      png         BLOB NOT NULL
    );
  `);

  const insert = db.prepare(`
    INSERT INTO employees
      (id, first_name, last_name, first_lower, last_lower, email, title, level, division, location, manager_id, start_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPhoto = db.prepare("INSERT INTO photos (employee_id, png) VALUES (?, ?)");

  db.exec("BEGIN");
  for (const e of employees) {
    insert.run(
      e.id, e.firstName, e.lastName, e.firstName.toLowerCase(), e.lastName.toLowerCase(),
      e.email, e.title, e.level, e.division, e.location, e.managerId, e.startDate,
    );
    insertPhoto.run(e.id, toPng(e.email, PHOTO_SIZE));
  }
  db.exec("COMMIT");

  db.exec(`
    CREATE INDEX employees_manager ON employees (manager_id);
    CREATE INDEX employees_first_name ON employees (first_lower);
    CREATE UNIQUE INDEX employees_full_name ON employees (last_lower, first_lower);
    CREATE INDEX employees_division_location ON employees (division, location);
    CREATE INDEX employees_location ON employees (location);
    CREATE INDEX employees_start_date ON employees (start_date);
    PRAGMA wal_checkpoint(TRUNCATE);
  `);
  db.close();
}

const started = performance.now();
const employees = generateCompany();
writeDatabase(employees);

const perLevel = new Map<number, number>();
for (const e of employees) perLevel.set(e.level, (perLevel.get(e.level) ?? 0) + 1);

console.log(`Seeded ${employees.length} employees and ${PHOTO_SIZE} px photos into ${DB_PATH}`);
for (const [level, count] of perLevel) console.log(`  Level ${level}: ${count}`);
console.log(`Database size: ${(statSync(DB_PATH).size / 1024 / 1024).toFixed(1)} MB`);
console.log(`Done in ${Math.round(performance.now() - started)} ms`);
