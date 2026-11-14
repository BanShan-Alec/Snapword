import type { AppModule } from '../AppModule';
import { closeDatabase, initDatabase } from '../db/client';
import type { ModuleContext } from '../ModuleContext';
import { getLogManager } from './log.module';

export class DatabaseModule implements AppModule {
  private readonly logger = getLogManager().scoped('DatabaseModule');

  enable({ app: electronApp }: ModuleContext): void {
    try {
      this.logger.info('Initializing SQLite database with Drizzle ORM');
      initDatabase();
      this.logger.info('Database initialized and migrations applied successfully');
    } catch (err) {
      this.logger.error('Failed to initialize database:', err);
    }

    electronApp.on('will-quit', () => {
      try {
        closeDatabase();
      } catch (err) {
        this.logger.warn('Error closing database on will-quit:', err);
      }
    });
  }
}

let dbModuleInstance: DatabaseModule | null = null;

export function createDatabaseModule(): DatabaseModule {
  if (!dbModuleInstance) {
    dbModuleInstance = new DatabaseModule();
  }
  return dbModuleInstance;
}
