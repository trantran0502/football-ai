import { NextResponse } from "next/server";

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
}

export function rateLimitedResponse(): NextResponse {
  return NextResponse.json({ ok: false, message: "Too many requests." }, { status: 429 });
}

export function badRequestResponse(message = "Bad request."): NextResponse {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

export function serviceUnavailableResponse(): NextResponse {
  return NextResponse.json({ ok: false, message: "Service unavailable." }, { status: 503 });
}

export function genericErrorResponse(status = 500): NextResponse {
  return NextResponse.json({ ok: false, message: "Request failed." }, { status });
}

export function publicHealthResponse(): NextResponse {
  return NextResponse.json({ ok: true }, { status: 200 });
}
