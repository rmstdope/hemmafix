export declare const TEST_DB_PREFIX: string;
export declare function serverUrl(): string;
export declare function databaseUrl(name: string): string;
export declare function dropDatabase(name: string): Promise<void>;
export declare function createDatabase(name: string, options?: { template?: string }): Promise<void>;
export declare function createMigratedDatabase(name: string): Promise<void>;
