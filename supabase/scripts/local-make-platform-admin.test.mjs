import { describe, expect, it } from "vitest";
import {
  assertLocalSupabaseEnv,
  makePlatformAdmin,
  parseSupabaseStatusEnv,
  run,
  validateAuthUserId
} from "./local-make-platform-admin.mjs";

const localEnv = {
  API_URL: "http://127.0.0.1:54321",
  DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
};

const authUserId = "123e4567-e89b-42d3-a456-426614174000";

function createPsqlMock(responses) {
  const calls = [];

  return {
    calls,
    psql(sql) {
      calls.push(sql);
      const response = responses.shift();

      if (response instanceof Error) {
        throw response;
      }

      return response;
    }
  };
}

describe("local make platform admin script", () => {
  it("parses Supabase CLI env output", () => {
    expect(parseSupabaseStatusEnv(`
API_URL="http://127.0.0.1:54321"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
PUBLISHABLE_KEY="local-key"
`)).toEqual({
      API_URL: "http://127.0.0.1:54321",
      DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      PUBLISHABLE_KEY: "local-key"
    });
  });

  it("requires exactly one valid UUID before touching the DB", () => {
    expect(() => run([], {
      env: localEnv,
      psql: () => {
        throw new Error("DB should not be touched.");
      }
    })).toThrow("Uso:");

    expect(() => run(["not-a-uuid"], {
      env: localEnv,
      psql: () => {
        throw new Error("DB should not be touched.");
      }
    })).toThrow("UUID valido");

    expect(validateAuthUserId(authUserId)).toBe(authUserId);
  });

  it("aborts for non-local API_URL or DB_URL before touching SQL", () => {
    expect(() => run([authUserId], {
      env: {
        API_URL: "https://project.supabase.co",
        DB_URL: localEnv.DB_URL
      },
      psql: () => {
        throw new Error("DB should not be touched.");
      }
    })).toThrow("API_URL no es local");

    expect(() => run([authUserId], {
      env: {
        API_URL: localEnv.API_URL,
        DB_URL: "postgresql://postgres:secret@db.project.supabase.co:5432/postgres"
      },
      psql: () => {
        throw new Error("DB should not be touched.");
      }
    })).toThrow("DB_URL no es local");
  });

  it("accepts explicit local hosts only", () => {
    expect(() => assertLocalSupabaseEnv({
      API_URL: "http://localhost:54321",
      DB_URL: "postgresql://postgres:postgres@[::1]:54322/postgres"
    })).not.toThrow();
  });

  it("fails clearly when the auth user does not exist", () => {
    const mock = createPsqlMock(["f"]);

    expect(() => makePlatformAdmin(authUserId, mock.psql)).toThrow(
      `No existe auth.users.id local para ${authUserId}.`
    );
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]).toContain("from auth.users");
  });

  it("creates a platform admin row on first execution", () => {
    const mock = createPsqlMock(["t", "f", ""]);

    expect(makePlatformAdmin(authUserId, mock.psql)).toEqual({
      alreadyEnabled: false
    });
    expect(mock.calls).toHaveLength(3);
    expect(mock.calls[2]).toContain("insert into public.platform_admins");
    expect(mock.calls[2]).toContain("on conflict (auth_user_id) do nothing");
  });

  it("is idempotent on second execution", () => {
    const mock = createPsqlMock(["t", "t", ""]);

    expect(makePlatformAdmin(authUserId, mock.psql)).toEqual({
      alreadyEnabled: true
    });
    expect(mock.calls).toHaveLength(3);
    expect(mock.calls[2]).toContain("on conflict (auth_user_id) do nothing");
  });
});
