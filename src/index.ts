import { Hono } from 'hono';

// 1. Define the list of tools with their install script URLs
interface ToolConfig {
  repo: string; // e.g., "anIcedAntFA/gohome"
  scriptPath: string; // e.g., "scripts/install.sh"
}

const TOOLS: Record<string, ToolConfig> = {
  gohome: {
    repo: 'anIcedAntFA/gohome',
    scriptPath: 'scripts/install.sh',
  },
};

const DEFAULT_DOMAIN = 'get.ngockhoi96.dev';
const CACHE_TTL = 300; // 5 minutes

const app = new Hono<{ Bindings: CloudflareBindings }>();

// 2. Home page route -> Display usage instructions
app.get('/', (c) => {
  const domain = c.req.header('host') || DEFAULT_DOMAIN;

  const toolList = Object.keys(TOOLS)
    .map((t) => `- curl -sSL ${domain}/${t} | bash`)
    .join('\n');

  return c.text(
    `🚀 ngockhoi96 installer hub\n\nAvailable tools:\n${toolList}\n\nUsage:\n  curl -sSL ${domain}/<tool_name> | bash`
  );
});

// 3. Install script route - Fetch and cache from GitHub
app.get('/:tool', async (c) => {
  const toolName = c.req.param('tool');
  const toolConfig = TOOLS[toolName];

  // Tool not found
  if (!toolConfig) {
    const domain = c.req.header('host') || DEFAULT_DOMAIN;
    return c.text(
      `Error: Tool '${toolName}' not found.\n\nAvailable tools at: ${domain}`,
      404
    );
  }

  const scriptURL = `https://raw.githubusercontent.com/${toolConfig.repo}/main/${toolConfig.scriptPath}`;
  const cacheKey = new Request(scriptURL, c.req.raw);

  try {
    // Try to get from cache first
    const cache = caches.default;
    let response = await cache.match(cacheKey);

    if (!response) {
      // Cache miss - fetch from GitHub
      response = await fetch(scriptURL);

      if (!response.ok) {
        return c.text(
          `Error: Failed to fetch script from GitHub (Status: ${response.status})`,
          502
        );
      }

      // Clone response for cache (can only read body once)
      response = new Response(response.body, response);

      // Set cache headers
      response.headers.set('Cache-Control', `public, max-age=${CACHE_TTL}`);

      // Store in Cloudflare cache
      c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    // Return script content
    return c.newResponse(response.body, 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
      'X-Cache-Status': response.headers.get('CF-Cache-Status') || 'WORKER',
    });
  } catch (error) {
    return c.text(
      `Internal Server Error: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
      500
    );
  }
});

export default app;
