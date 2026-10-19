export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  return new Response(JSON.stringify({ user: null }), {
    headers: { "Access-Control-Allow-Origin": origin || "*", "content-type": "application/json" },
  });
}
