// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-component-explorer
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const loopback = require('loopback');
const explorer = require('../');
const request = require('supertest');
const expect = require('chai').expect;

describe('explorer', function() {
  describe('with default config', function() {
    beforeEach(givenLoopBackAppWithExplorer());

    it('should register "loopback-component-explorer" to the app', function() {
      expect(this.app.get('loopback-component-explorer'))
        .to.have.property('mountPath', '/explorer');
    });

    it('should return 404 not found', function(done) {
      request(this.app)
        .get('/explorer')
        .expect(404)
        .end(done);
    });

    it('should serve the explorer at /explorer/', function(done) {
      request(this.app)
        .get('/explorer/')
        .expect('Content-Type', /json/)
        .expect(404)
        .end(done);
    });

    it('should serve correct swagger config', function(done) {
      request(this.app)
        .get('/explorer/config.json')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);

          expect(res.body).to
            .have.property('url', '/explorer/swagger.json');

          done();
        });
    });
  });

  describe('when filename is included in url', function() {
    beforeEach(givenLoopBackAppWithExplorer());

    it('should not serve the explorer at /explorer/index.html', function(done) {
      request(this.app)
        .get('/explorer/index.html')
        .expect(404)
        .end(done);
    });

    it('should serve correct swagger-ui config', function(done) {
      request(this.app)
        .get('/explorer/config.json')
        .set('Referer', 'http://example.com/explorer/index.html')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);

          expect(res.body).to
            .have.property('url', '/explorer/swagger.json');

          done();
        });
    });
  });

  describe('with custom explorer base', function() {
    beforeEach(givenLoopBackAppWithExplorer('/swagger'));

    it('should register "loopback-component-explorer" to the app', function() {
      expect(this.app.get('loopback-component-explorer'))
        .to.have.property('mountPath', '/swagger');
    });

    it('should serve correct swagger-ui config', function(done) {
      request(this.app)
        .get('/swagger/config.json')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);

          expect(res.body).to
            .have.property('url', '/swagger/swagger.json');

          done();
        });
    });
  });

  describe('with custom app.restApiRoot', function() {
    it('should serve correct swagger-ui config', function(done) {
      const app = loopback();
      app.set('restApiRoot', '/rest-api-root');
      app.set('remoting', {cors: false});
      configureRestApiAndExplorer(app);

      request(app)
        .get('/explorer/config.json')
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);

          expect(res.body).to
            .have.property('url', '/explorer/swagger.json');

          done();
        });
    });

    it('removes trailing slash from baseUrl', function(done) {
      // SwaggerUI builds resource URL by concatenating basePath + resourcePath
      // Since the resource paths are always startign with a slash,
      // if the basePath ends with a slash too, an incorrect URL is produced
      const app = loopback();
      app.set('restApiRoot', '/apis/');
      app.set('remoting', {cors: false});
      configureRestApiAndExplorer(app);

      request(app)
        .get('/explorer/swagger.json')
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);

          const baseUrl = res.body.basePath;
          const apiPath = Object.keys(res.body.paths)[0];
          expect(baseUrl + apiPath).to.equal('/apis/products');

          done();
        });
    });
  });

  describe('explorer.routes API', function() {
    let app;
    beforeEach(function() {
      app = loopback();
      app.set('remoting', {cors: false});
      const Product = loopback.PersistedModel.extend('product');
      Product.attachTo(loopback.memory());
      app.model(Product);
    });

    it('creates explorer routes', function(done) {
      app.use('/explorer', explorer.routes(app));
      app.use(app.get('restApiRoot') || '/', loopback.rest());

      request(app)
        .get('/explorer/config.json')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(done);
    });
  });

  it('updates swagger object when a new model is added', function(done) {
    const app = loopback();
    app.set('remoting', {cors: false});
    configureRestApiAndExplorer(app, '/explorer');

    // Ensure the swagger object was built
    request(app)
      .get('/explorer/swagger.json')
      .expect(200)
      .end(function(err) {
        if (err) return done(err);

        // Create a new model
        const Model = loopback.PersistedModel.extend('Customer');
        Model.attachTo(loopback.memory());
        app.model(Model);

        // Request swagger.json again
        request(app)
          .get('/explorer/swagger.json')
          .expect(200)
          .end(function(err, res) {
            if (err) return done(err);

            const modelNames = Object.keys(res.body.definitions);
            expect(modelNames).to.contain('Customer');
            const paths = Object.keys(res.body.paths);
            expect(paths).to.have.contain('/Customers');

            done();
          });
      });
  });

  it('updates swagger object when a model is removed', function(done) {
    const app = loopback();
    app.set('remoting', {cors: false});
    configureRestApiAndExplorer(app, '/explorer');

    const Model = loopback.PersistedModel.extend('Customer');
    Model.attachTo(loopback.memory());
    app.model(Model);

    // Ensure the swagger object was built
    request(app)
      .get('/explorer/swagger.json')
      .expect(200)
      .end(function(err) {
        if (err) return done(err);

        app.deleteModelByName('Customer');

        // Request swagger.json again
        request(app)
          .get('/explorer/swagger.json')
          .expect(200)
          .end(function(err, res) {
            if (err) return done(err);

            const modelNames = Object.keys(res.body.definitions);
            expect(modelNames).to.not.contain('Customer');
            const paths = Object.keys(res.body.paths);
            expect(paths).to.not.contain('/Customers');

            done();
          });
      });
  });

  it('updates swagger object when a remote method is disabled', function(done) {
    const app = loopback();
    app.set('remoting', {cors: false});
    configureRestApiAndExplorer(app, '/explorer');

    // Ensure the swagger object was built
    request(app)
      .get('/explorer/swagger.json')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);

        // Check the method that will be disabled
        const paths = Object.keys(res.body.paths);
        expect(paths).to.contain('/products/findOne');

        const Product = app.models.Product;
        Product.disableRemoteMethodByName('findOne');

        // Request swagger.json again
        request(app)
          .get('/explorer/swagger.json')
          .expect(200)
          .end(function(err, res) {
            if (err) return done(err);

            const paths = Object.keys(res.body.paths);
            expect(paths).to.not.contain('/products/findOne');

            done();
          });
      });
  });

  it('updates swagger object when a remote method is added', function(done) {
    const app = loopback();
    app.set('remoting', {cors: false});
    configureRestApiAndExplorer(app, '/explorer');

    // Ensure the swagger object was built
    request(app)
      .get('/explorer/swagger.json')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);

        // Check the method that will be disabled
        const paths = Object.keys(res.body.paths);
        expect(paths).to.contain('/products/findOne');

        const Product = app.models.Product;
        Product.findOne2 = function(cb) { cb(null, 1); };
        Product.remoteMethod('findOne2', {});

        // Request swagger.json again
        request(app)
          .get('/explorer/swagger.json')
          .expect(200)
          .end(function(err, res) {
            if (err) return done(err);

            const paths = Object.keys(res.body.paths);
            expect(paths).to.contain('/products/findOne2');

            done();
          });
      });
  });

  function givenLoopBackAppWithExplorer(explorerBase) {
    return function(done) {
      const app = this.app = loopback();
      app.set('remoting', {cors: false});
      configureRestApiAndExplorer(app, explorerBase);

      done();
    };
  }

  function configureRestApiAndExplorer(app, explorerBase) {
    const Product = loopback.PersistedModel.extend('product');
    Product.attachTo(loopback.memory());
    app.model(Product);

    explorer(app, {mountPath: explorerBase});
    app.set('legacyExplorer', false);
    app.use(app.get('restApiRoot') || '/', loopback.rest());
  }
});
