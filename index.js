// Copyright IBM Corp. 2013,2019. All Rights Reserved.
// Node module: loopback-component-explorer
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

const SG = require('strong-globalize');
SG.SetRootDir(__dirname);
const g = SG();

/*!
 * Adds dynamically-updated docs as /explorer
 */
const url = require('url');
const path = require('path');
const urlJoin = require('./lib/url-join');
const _defaults = require('lodash').defaults;
const createSwaggerObject = require('loopback-swagger').generateSwaggerSpec;

module.exports = explorer;
explorer.routes = routes;

/**
 * Example usage:
 *
 * var explorer = require('loopback-component-explorer');
 * explorer(app, options);
 */

function explorer(loopbackApplication, options) {
  options = _defaults({}, options, {mountPath: '/explorer'});
  loopbackApplication.use(
    options.mountPath,
    routes(loopbackApplication, options)
  );
  loopbackApplication.set('loopback-component-explorer', options);
}

function routes(loopbackApplication, options) {
  const loopback = loopbackApplication.loopback;
  const loopbackMajor =
    (loopback && loopback.version && loopback.version.split('.')[0]) || 1;

  if (loopbackMajor < 2) {
    throw new Error(
      g.f(
        '{{loopback-component-explorer}} requires ' +
          '{{loopback}} 2.0 or newer'
      )
    );
  }

  options = _defaults({}, options, {
    resourcePath: 'swagger.json',
    apiInfo: loopbackApplication.get('apiInfo') || {},
    swaggerUI: false,
  });

  const router = new loopback.Router();

  mountSwagger(loopbackApplication, router, options);

  // config.json is loaded by swagger-ui. The server should respond
  // with the relative URI of the resource doc.
  router.get('/config.json', function(req, res) {
    // Get the path we're mounted at. It's best to get this from the referer
    // in case we're proxied at a deep path.
    let source = url.parse(req.headers.referer || '').pathname;
    // strip index.html if present in referer
    if (source && /\/index\.html$/.test(source)) {
      source = source.replace(/\/index\.html$/, '');
    }
    // If no referer is available, use the incoming url.
    if (!source) {
      source = req.originalUrl.replace(/\/config.json(\?.*)?$/, '');
    }
    res.send({
      url: urlJoin(source, '/' + options.resourcePath),
      auth: options.auth,
    });
  });

  return router;
}

/**
 * Setup Swagger documentation on the given express app.
 *
 * @param {Application} loopbackApplication The loopback application to
 * document.
 * @param {Application} swaggerApp Swagger application used for hosting
 * swagger documentation.
 * @param {Object} opts Options.
 */
function mountSwagger(loopbackApplication, swaggerApp, opts) {
  let swaggerObject = createSwaggerObject(loopbackApplication, opts);

  // listening to modelRemoted event for updating the swaggerObject
  // with the newly created model to appear in the Swagger UI.
  loopbackApplication.on('modelRemoted', rebuildSwaggerObject);

  loopbackApplication.on('modelDeleted', rebuildSwaggerObject);

  // listening to started event for updating the swaggerObject
  // when a call to app.models.[modelName].nestRemoting([modelName])
  // to appear that method in the Swagger UI.
  loopbackApplication.on('remoteMethodAdded', rebuildSwaggerObject);

  // listening to remoteMethodDisabled event for updating the swaggerObject
  // when a remote method is disabled to hide that method in the Swagger UI.
  loopbackApplication.on('remoteMethodDisabled', rebuildSwaggerObject);

  let resourcePath = (opts && opts.resourcePath) || 'swagger.json';
  if (resourcePath[0] !== '/') resourcePath = '/' + resourcePath;

  swaggerApp.get(resourcePath, function sendSwaggerObject(req, res) {
    res.status(200).send(swaggerObject);
  });

  function rebuildSwaggerObject() {
    swaggerObject = createSwaggerObject(loopbackApplication, opts);
  }
}
