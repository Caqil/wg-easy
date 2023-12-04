'use strict';

const path = require('path');

const express = require('express');
const expressSession = require('express-session');
const debug = require('debug')('Server');

const Util = require('./Util');
const ServerError = require('./ServerError');
const WireGuard = require('../services/WireGuard');

const {
  PORT,
  WEBUI_HOST,
  RELEASE,
  PASSWORD,
} = require('../config');

module.exports = class Server {

  constructor() {
    // Express
    this.app = express()
      .disable('etag')
      .use('/', express.static(path.join(__dirname, '..', 'www')))
      .use(express.json())
      .use(expressSession({
        secret: String(Math.random()),
        resave: true,
        saveUninitialized: true,
      }))

      .get('/api/release', (Util.promisify(async () => {
        return RELEASE;
      })))

      // Authentication
      .get('/api/session', Util.promisify(async (req) => {
        const requiresPassword = !!process.env.PASSWORD;
        const authenticated = requiresPassword
          ? !!(req.session && req.session.authenticated)
          : true;

        return {
          requiresPassword,
          authenticated,
        };
      }))
      .post('/api/session', Util.promisify(async (req) => {
        const {
          password,
        } = req.body;

        if (typeof password !== 'string') {
          throw new ServerError('Missing: Password', 401);
        }

        if (password !== PASSWORD) {
          throw new ServerError('Incorrect Password', 401);
        }

        req.session.authenticated = true;
        req.session.save();

        debug(`New Session: ${req.session.id}`);
      }))

      // WireGuard
      .use((req, res, next) => {
        if (!PASSWORD) {
          return next();
        }

        if (req.session && req.session.authenticated) {
          return next();
        }

        return res.status(401).json({
          error: 'Not Logged In',
        });
      })
      .delete('/api/session', Util.promisify(async (req) => {
        const sessionId = req.session.id;

        req.session.destroy();

        debug(`Deleted Session: ${sessionId}`);
      }))
      .get('/api/wireguard/client', Util.promisify(async (req) => {
        return WireGuard.getClients();
      }))
      .get('/api/wireguard/client/:clientId/qrcode.svg', Util.promisify(async (req, res) => {
        const { clientId } = req.params;
        const svg = await WireGuard.getClientQRCodeSVG({ clientId });
        res.header('Content-Type', 'image/svg+xml');
        res.send(svg);
      }))
      .get('/api/wireguard/client/:clientId/text', Util.promisify(async (req, res) => {
        const { clientId } = req.params;
        const config = await WireGuard.getClientConfiguration({ clientId });
        res.header('Content-Type', 'text/plain');
        res.send(config);
      }))
      .get('/api/wireguard/client/:clientId/json', async (req, res) => {
        const { clientId } = req.params;
        const configuration = await WireGuard.getClientConfigurationJson({ clientId });
        res.header('Content-Type', 'application/json');
        const prettyConfig = JSON.stringify(configuration, null, 2);
        res.json(prettyConfig);
      })
      .post('/api/wireguard/client/', Util.promisify(async (req) => {
        const { clientId } = req.body;
        return WireGuard.createClient({ clientId });
      }))

      .delete('/api/wireguard/client/:clientId', Util.promisify(async (req) => {
        const { clientId } = req.params;
        return WireGuard.deleteClient({ clientId });
      }))
      .post('/api/wireguard/client/:clientId/enable', Util.promisify(async (req) => {
        const { clientId } = req.params;
        return WireGuard.enableClient({ clientId });
      }))
      .post('/api/wireguard/client/:clientId/disable', Util.promisify(async (req) => {
        const { clientId } = req.params;
        return WireGuard.disableClient({ clientId });
      }))
      .put('/api/wireguard/client/:clientId', Util.promisify(async (req) => {
        const { clientId } = req.params;
        return WireGuard.updateClientName({ clientId });
      }))
      .put('/api/wireguard/client/:clientId/address', Util.promisify(async (req) => {
        const { clientId } = req.params;
        const { address } = req.body;
        return WireGuard.updateClientAddress({ clientId, address });
      }))
      .put('/api/wireguard/client/:clientId/dns', Util.promisify(async (req) => {
        const { clientId } = req.params;
        const { dns } = req.body;
        return WireGuard.updateClientDns({ clientId, dns });
      }))
      .listen(PORT, WEBUI_HOST, () => {
        debug(`Listening on http://${WEBUI_HOST}:${PORT}`);
      });
  }

};