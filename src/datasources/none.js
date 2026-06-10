/**
 * NONE datasource - passes data through without any external service.
 * Useful for local resolvers that compute results without needing a datasource.
 */
class NoneDatasource {
  constructor(name) {
    this.name = name;
    console.log(`  [NONE] Initialized: ${name}`);
  }

  /**
   * Simply returns the request payload as the result.
   */
  async invoke(request, context) {
    console.log(`  [NONE] ${this.name}: pass-through`);
    return request;
  }
}

module.exports = { NoneDatasource };
