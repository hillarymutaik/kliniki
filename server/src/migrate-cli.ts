import { migrate } from './migrate';

const ownerUrl = process.env.DATABASE_OWNER_URL;
if (!ownerUrl) {
  console.error('DATABASE_OWNER_URL is required to run migrations.');
  process.exit(1);
}

migrate({ ownerUrl, appRole: process.env.APP_DB_ROLE || undefined, appPassword: process.env.APP_DB_PASSWORD, log: (m) => console.log(m) })
  .then((applied) => console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Database is up to date.'))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
