import { strict as assert } from "node:assert";
import { test } from "node:test";
import { forwardRegistrationToMaster } from "./master-admin-registration.js";
import { RegistrationDeliveryError } from "./registration-delivery-error.js";

const registration = {
  namaSekolah: "PKBM Armilla Nusa",
  npsn: "P9984421",
  wilayah: "Bandung",
  namaKontak: "Ismanto Juliansyah",
  emailKontak: "admin@example.invalid",
  teleponKontak: "085224025555",
};

test("registration delivery forwards normalized data using a backend bearer token", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };

  await forwardRegistrationToMaster("4a9b327c-6761-49f7-8551-98d9eb093227", registration, {
    endpoint: "http://127.0.0.1:3000/api/lms-registrations",
    token: "shared-test-token",
    production: false,
    fetcher,
  });

  assert.equal(requestUrl, "http://127.0.0.1:3000/api/lms-registrations");
  assert.equal(new Headers(requestInit?.headers).get("authorization"), "Bearer shared-test-token");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    registrationId: "4a9b327c-6761-49f7-8551-98d9eb093227",
    institutionName: registration.namaSekolah,
    npsn: registration.npsn,
    region: registration.wilayah,
    adminName: registration.namaKontak,
    adminEmail: registration.emailKontak,
    adminPhone: registration.teleponKontak,
  });

  await forwardRegistrationToMaster("4a9b327c-6761-49f7-8551-98d9eb093227", { ...registration, paket: "Reguler", nominalTahunan: 1750000 }, {
    endpoint: "http://127.0.0.1:3000/api/lms-registrations",
    token: "shared-test-token",
    production: false,
    fetcher,
  });
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    registrationId: "4a9b327c-6761-49f7-8551-98d9eb093227",
    institutionName: registration.namaSekolah,
    npsn: registration.npsn,
    region: registration.wilayah,
    adminName: registration.namaKontak,
    adminEmail: registration.emailKontak,
    adminPhone: registration.teleponKontak,
    plan: "Reguler",
    paket: "Reguler",
    annualPrice: 1750000,
    nominalTahunan: 1750000,
  });
});

test("registration delivery fails closed for invalid config and remote errors", async () => {
  await assert.rejects(
    () => forwardRegistrationToMaster("4a9b327c-6761-49f7-8551-98d9eb093227", registration, {
      endpoint: "http://example.invalid/api/lms-registrations",
      token: "token",
      production: true,
    }),
    (error: unknown) =>
      error instanceof RegistrationDeliveryError &&
      error.code === "MASTER_ADMIN_REGISTRATION_UNAVAILABLE",
  );

  await assert.rejects(
    () => forwardRegistrationToMaster("4a9b327c-6761-49f7-8551-98d9eb093227", registration, {
      endpoint: "http://127.0.0.1:3000/api/lms-registrations",
      token: "token",
      production: false,
      fetcher: async () => new Response(JSON.stringify({ success: false }), { status: 409 }),
    }),
    (error: unknown) =>
      error instanceof RegistrationDeliveryError &&
      error.code === "MASTER_ADMIN_REGISTRATION_CONFLICT" &&
      error.statusCode === 409,
  );

  await assert.rejects(
    () => forwardRegistrationToMaster("4a9b327c-6761-49f7-8551-98d9eb093227", registration, {
      endpoint: "http://127.0.0.1:3000/api/lms-registrations",
      token: "token",
      production: false,
      fetcher: async () => new Response("unavailable", { status: 503 }),
    }),
    (error: unknown) =>
      error instanceof RegistrationDeliveryError &&
      error.code === "MASTER_ADMIN_REGISTRATION_UNAVAILABLE",
  );
});
