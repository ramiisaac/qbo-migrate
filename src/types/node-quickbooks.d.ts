declare module 'node-quickbooks' {
  interface QuickBooksConstructor {
    new (
      clientId: string,
      clientSecret: string,
      accessToken: string,
      useProduction: boolean,
      realmId: string,
      useSandbox: boolean,
      debug?: boolean,
      minorVersion?: number | null,
      version?: string,
      refreshToken?: string
    ): unknown;
  }

  const QuickBooks: QuickBooksConstructor;
  export = QuickBooks;
}
