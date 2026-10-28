/** Typechecking the Edge entrypoint with the local TypeScript toolchain. Runtime is Supabase Deno. */
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): unknown
}
