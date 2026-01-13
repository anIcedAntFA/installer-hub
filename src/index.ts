import { Hono } from 'hono';

// 1. Định nghĩa danh sách các tool và link raw tương ứng
const TOOLS: Record<string, string> = {
  gohome:
    'https://raw.githubusercontent.com/anIcedAntFA/gohome/main/scripts/install.sh',
};

const app = new Hono<{ Bindings: CloudflareBindings }>();

// 2. Route trang chủ (get.ngockhoi96.dev) -> Hiển thị hướng dẫn
app.get('/', (c) => {
  const toolList = Object.keys(TOOLS)
    .map((t) => `- curl get.ngockhoi96.dev/${t} | sh`)
    .join('\n');

  return c.text(
    `🚀 ngockhoi96 installer hub\n\nAvailable tools:\n${toolList}\n\nUsage:\n  curl get.ngockhoi96.dev/<tool_name> | sh`
  );
});

// 3. Route xử lý từng tool (get.ngockhoi96.dev/:tool)
app.get('/:tool', async (c) => {
  const toolName = c.req.param('tool');
  const targetURL = TOOLS[toolName];

  // Nếu không tìm thấy tool trong danh sách
  if (!targetURL) {
    return c.text(
      `Error: Tool '${toolName}' not found.\nCheck get.ngockhoi96.dev for available tools.`,
      404
    );
  }

  try {
    // Fetch nội dung script từ GitHub
    const response = await fetch(targetURL);

    if (!response.ok) {
      return c.text(
        `Error: Failed to fetch script from source (Status: ${response.status})`,
        502
      );
    }

    // Lấy nội dung script
    const scriptContent = await response.text();

    // Trả về script để curl có thể thực thi (pipe | sh)
    return c.newResponse(scriptContent, 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      // Cache ngắn hạn (ví dụ 1 phút) để đỡ spam GitHub nếu nhiều người tải cùng lúc
      'Cache-Control': 'public, max-age=60',
    });
  } catch (error) {
    return c.text('Internal Server Error: Unable to fetch the script.', 500);
  }
});

export default app;
