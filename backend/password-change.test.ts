import { strict as assert } from "node:assert";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";

test("school admins and teachers can change passwords and revoke active sessions", {
  skip: process.env.RUN_PASSWORD_CHANGE_INTEGRATION !== "1",
  timeout: 120000,
}, async () => {
  process.env.NODE_ENV = "development";
  const { prisma, pool, loginPool } = await import("./db.js");
  const { hashPassword, verifyPassword } = await import("./password.js");
  const { default: app } = await import("./server.js");
  const schoolId = randomUUID();
  const adminId = randomUUID();
  const teacherId = randomUUID();
  const teacherProfileId = randomUUID();
  const adminToken = randomBytes(32).toString("hex");
  const teacherToken = randomBytes(32).toString("hex");
  const oldPassword = randomBytes(24).toString("hex");
  const adminNewPassword = randomBytes(24).toString("hex");
  const teacherNewPassword = randomBytes(24).toString("hex");
  const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

  let server: ReturnType<typeof app.listen> | undefined;
  try {
    await prisma.sekolah.create({ data: { id: schoolId, nama: "Password test", slug: `pw-${schoolId}` } });
    const oldPasswordHash = await hashPassword(oldPassword);
    await prisma.guru.create({
      data: {
        id: teacherProfileId,
        nama: "Password test teacher",
        mapelUtama: "Umum",
        email: `${teacherId}@example.invalid`,
        telepon: "0800000000",
        status: "Aktif",
        sekolahId: schoolId,
      },
    });
    await prisma.akun.createMany({
      data: [
        { id: adminId, email: `${adminId}@example.invalid`, nama: "Password test admin", peran: "ADMIN", sekolahId: schoolId, passwordHash: oldPasswordHash },
        { id: teacherId, email: `${teacherId}@example.invalid`, nama: "Password test teacher", peran: "GURU", sekolahId: schoolId, guruId: teacherProfileId, passwordHash: oldPasswordHash },
      ],
    });
    await prisma.sesiAkun.createMany({
      data: [
        { akunId: adminId, tokenHash: tokenHash(adminToken), expiresAt: new Date(Date.now() + 60000) },
        { akunId: teacherId, tokenHash: tokenHash(teacherToken), expiresAt: new Date(Date.now() + 60000) },
      ],
    });

    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const post = (path: string, body: unknown, cookie: string) => fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });

    const adminCookie = `sekolah_session=${adminToken}`;
    const teacherCookie = `lms_session=${teacherToken}`;
    assert.equal((await post("/api/auth/sekolah/ganti-password", { currentPassword: "wrong", password: adminNewPassword }, adminCookie)).status, 400);
    assert.equal((await post("/api/auth/lms/ganti-password", { currentPassword: "wrong", password: teacherNewPassword }, teacherCookie)).status, 400);

    assert.equal((await post("/api/auth/sekolah/ganti-password", { currentPassword: oldPassword, password: adminNewPassword }, adminCookie)).status, 200);
    assert.equal((await post("/api/auth/lms/ganti-password", { currentPassword: oldPassword, password: teacherNewPassword }, teacherCookie)).status, 200);
    assert.equal((await fetch(`${base}/api/auth/sekolah/session`, { headers: { cookie: adminCookie } })).status, 401);
    assert.equal((await fetch(`${base}/api/auth/lms/session`, { headers: { cookie: teacherCookie } })).status, 401);

    const [admin, teacher] = await Promise.all([
      prisma.akun.findUniqueOrThrow({ where: { id: adminId } }),
      prisma.akun.findUniqueOrThrow({ where: { id: teacherId } }),
    ]);
    assert.equal(await verifyPassword(adminNewPassword, admin.passwordHash), true);
    assert.equal(await verifyPassword(teacherNewPassword, teacher.passwordHash), true);
    assert.equal(await verifyPassword(oldPassword, admin.passwordHash), false);
    assert.equal(await verifyPassword(oldPassword, teacher.passwordHash), false);
  } finally {
    if (server) {
      server.close();
      await once(server, "close");
    }
    await prisma.akun.deleteMany({ where: { id: { in: [adminId, teacherId] } } });
    await prisma.guru.deleteMany({ where: { id: teacherProfileId } });
    await prisma.sekolah.deleteMany({ where: { id: schoolId } });
    await prisma.$disconnect();
    await Promise.all([pool.end(), loginPool.end()]);
  }
});
