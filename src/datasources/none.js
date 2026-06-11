/**
 * NONE datasource — passes data through without any external service.
 */
class NoneDatasource {
  constructor(name) {
    this.name = name;
  }

  async invoke(request) {
    return request;
  }
}

module.exports = { NoneDatasource };
