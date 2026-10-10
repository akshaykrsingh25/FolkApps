import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type QueryResultRow } from 'pg';

export type SqlQuery = <Row extends QueryResultRow = QueryResultRow>(sql: string, values?: readonly unknown[]) => Promise<Row[]>;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 12,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'incuspaze-asset-register-api',
  });

  async check(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async query<Row extends import('pg').QueryResultRow = import('pg').QueryResultRow>(sql: string, values: readonly unknown[] = []): Promise<Row[]> {
    const result = await this.pool.query<Row>(sql, [...values]);
    return result.rows;
  }

  async transaction<T>(work: (query: SqlQuery) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const query: SqlQuery = async <Row extends QueryResultRow>(sql: string, values: readonly unknown[] = []) => {
      const result = await client.query<Row>(sql, [...values]);
      return result.rows;
    };
    try {
      await client.query('BEGIN');
      const result = await work(query);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
