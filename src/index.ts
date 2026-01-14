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
app.get('/', (ctx) => {
  const domain = ctx.req.header('host') || DEFAULT_DOMAIN;

  const toolList = Object.keys(TOOLS)
    .map((t) => `- curl -sSL ${domain}/${t} | bash`)
    .join('\n');

  return ctx.text(
    `🚀 ngockhoi96 installer hub\n\nAvailable tools:\n${toolList}\n\nUsage:\n  curl -sSL ${domain}/<tool_name> | bash`
  );
});

// 3. Install script route - Fetch and cache from GitHub
app.get('/:tool', async (ctx) => {
  const toolName = ctx.req.param('tool');
  const toolConfig = TOOLS[toolName];

  // Tool not found
  if (!toolConfig) {
    const domain = ctx.req.header('host') || DEFAULT_DOMAIN;
    return ctx.text(
      `Error: Tool '${toolName}' not found.\n\nAvailable tools at: ${domain}`,
      404
    );
  }

  const scriptURL = `https://raw.githubusercontent.com/${toolConfig.repo}/main/${toolConfig.scriptPath}`;

  // Create a consistent cache key (no varying headers)
  const cacheKey = new Request(scriptURL, {
    method: 'GET',
  });

  try {
    // Try to get from cache first
    const cache = caches.default;
    let response = await cache.match(cacheKey);
    let cacheStatus = 'MISS';

    if (response) {
      // Cache hit
      cacheStatus = 'HIT';
      console.log(
        `[${cacheStatus}] ${toolName} - User-Agent: ${ctx.req.header(
          'user-agent'
        )} - IP: ${ctx.req.header('cf-connecting-ip')}`
      );
    } else {
      cacheStatus = 'MISS';
      console.log(
        `[${cacheStatus}] ${toolName} - User-Agent: ${ctx.req.header(
          'user-agent'
        )} - IP: ${ctx.req.header('cf-connecting-ip')}`
      );
      // Cache miss - fetch from GitHub with Cloudflare cache options
      response = await fetch(scriptURL, {
        cf: {
          cacheTtl: CACHE_TTL,
          cacheEverything: true,
        },
      });

      if (!response.ok) {
        return ctx.text(
          `Error: Failed to fetch script from GitHub (Status: ${response.status})`,
          502
        );
      }

      // Create a new response with proper cache headers
      response = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
          'X-Content-Source': 'github',
        },
      });

      // Store in Cloudflare cache (async, don't block response)
      ctx.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    // Return script content with cache status
    return ctx.newResponse(response.body, 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
      'X-Cache-Status': cacheStatus,
      'X-Worker-Version': '1.0.0',
    });
  } catch (error) {
    return ctx.text(
      `Internal Server Error: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
      500
    );
  }
});

export default app;
