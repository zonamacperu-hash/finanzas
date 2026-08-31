export async function onRequestGet(context) {
  try {
    const kv = context.env.FINANZAS_KV || context.env.EFOOTBALL_KV;
    if (!kv) {
      return new Response(JSON.stringify({ error: "KV database binding FINANZAS_KV not found. Please bind FINANZAS_KV or EFOOTBALL_KV in Cloudflare dashboard." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const state = await kv.get("finanzas_state");
    if (!state) {
      return new Response(JSON.stringify({ empty: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(state, {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function onRequestPost(context) {
  try {
    const kv = context.env.FINANZAS_KV || context.env.EFOOTBALL_KV;
    if (!kv) {
      return new Response(JSON.stringify({ error: "KV database binding FINANZAS_KV not found." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Verify passcode auth in Authorization header
    const authHeader = context.request.headers.get("Authorization");
    if (authHeader !== "admin777") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await context.request.json();
    if (typeof body !== 'object' || body === null) {
      return new Response(JSON.stringify({ error: "Invalid state structure" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    await kv.put("finanzas_state", JSON.stringify(body));

    return new Response(JSON.stringify({ success: true, timestamp: Date.now() }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
