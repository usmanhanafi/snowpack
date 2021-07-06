import http from 'http';
import mime from 'mime-types';
import path from 'path';
import url from 'url';
import * as esbuild from 'esbuild';
import esbuildSvelte from 'esbuild-svelte';
// import esbuildVue from 'esbuild-vue';
import {logger} from '../logger';
import {CommandOptions, SnowpackDevServer} from '../types';

function sendResponseError(req: http.IncomingMessage, res: http.ServerResponse, status: number) {
  const contentType = mime.contentType(path.extname(req.url!) || '.html');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType || 'application/octet-stream',
    Vary: 'Accept-Encoding',
  };
  res.writeHead(status, headers);
  res.end();
}

export async function startServer(
  commandOptions: CommandOptions,
  {
    isDev: _isDev,
    isWatch: _isWatch,
    preparePackages: _preparePackages,
  }: {isDev?: boolean; isWatch?: boolean; preparePackages?: boolean} = {},
): Promise<SnowpackDevServer> {
  const port = commandOptions.config.devOptions.port || 8080;

  // TODO: fix
  const entryPoints = ['src/index.jsx'];

  const esbuildServer = await esbuild.serve(
    {
      servedir: url.fileURLToPath(commandOptions.config.devOptions.root as any),
    },
    {
      bundle: true,
      entryPoints,
      outbase: 'dist',
      minify: commandOptions.config.mode === 'production',
      plugins: [
        esbuildSvelte(),
        // esbuildVue(),
      ],
    },
  );

  async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    let {url = '/'} = req;
    const esbuildReq = http.request(
      {
        hostname: esbuildServer.host,
        port: esbuildServer.port,
        path: url,
        method: req.method,
        headers: req.headers,
      },
      (esbuildRes) => {
        console.log({url, path: esbuildReq.path, statusCode: esbuildRes.statusCode});
        res.writeHead(esbuildRes.statusCode || 200, esbuildRes.headers);
        esbuildRes.pipe(res, {end: true});
      },
    );
    req.pipe(esbuildReq, {end: true});
  }

  const server = http.createServer(handleRequest).listen(port);

  console.log(`Live at http://localhost:${port}`);

  return {
    port,
    hmrEngine: {} as any,
    rawServer: server,
    async loadUrl() {
      return {
        contents: 'something',
        imports: [],
        originalFileLoc: '/',
        contentType: 'text/html',
        async checkStale() {},
      } as any;
    },
    handleRequest,
    sendResponseFile: handleRequest,
    sendResponseError,
    async getUrlForPackage(pkgSpec: string) {
      return pkgSpec;
    },
    getUrlForFile(fileLoc: string) {
      return fileLoc;
    },
    onFileChange(callback) {
      return callback({filePath: 'boo'});
    },
    getServerRuntime(options) {
      return {
        async importModule() {
          return {exports: {} as any, css: []};
        },
        invalidateModule() {
          return options?.invalidateOnChange;
        },
      };
    },
    async shutdown() {
      esbuildServer.stop();
    },
    markChanged(fileLoc) {
      console.log({changed: fileLoc});
    },
  };
}

export async function command(commandOptions: CommandOptions) {
  try {
    // Set some CLI-focused defaults
    commandOptions.config.devOptions.output =
      commandOptions.config.devOptions.output || 'dashboard';
    commandOptions.config.devOptions.open = commandOptions.config.devOptions.open || 'default';
    commandOptions.config.devOptions.hmr = commandOptions.config.devOptions.hmr !== false;
    // Start the server
    await startServer(commandOptions, {isWatch: true});
  } catch (err) {
    logger.error(err.message);
    logger.debug(err.stack);
    process.exit(1);
  }
  return new Promise(() => {});
}
