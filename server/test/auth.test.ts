import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { setup } from './helpers.js';

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => {
  await ctx.db.end();
});

describe('auth', () => {
  it('logs in with the right password and returns the role', async () => {
    expect(ctx.cashier.user).toMatchObject({ email: 'cashier@primecoffee.test', role: 'cashier' });
    const me = await ctx.as(ctx.cashier).get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('cashier');
  });

  it('rejects a wrong password', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'cashier@primecoffee.test', password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('requires a token for protected routes', async () => {
    expect((await request(ctx.app).get('/api/orders')).status).toBe(401);
    expect((await request(ctx.app).get('/api/orders').set('Authorization', 'Bearer junk')).status).toBe(401);
  });

  it('blocks deactivated staff from logging in', async () => {
    const created = await ctx.as(ctx.manager).post('/api/users', {
      name: 'Temp Barista',
      email: 'temp@primecoffee.test',
      password: 'temporary1',
      role: 'barista',
    });
    expect(created.status).toBe(201);
    await ctx.as(ctx.manager).patch(`/api/users/${created.body.user.id}`, { active: false });
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'temp@primecoffee.test', password: 'temporary1' });
    expect(res.status).toBe(401);
  });

  it('only lets managers manage staff', async () => {
    expect((await ctx.as(ctx.cashier).get('/api/users')).status).toBe(403);
    expect((await ctx.as(ctx.barista).get('/api/users')).status).toBe(403);
    expect((await ctx.as(ctx.manager).get('/api/users')).status).toBe(200);
  });

  it('stops a manager from deactivating themselves', async () => {
    const res = await ctx.as(ctx.manager).patch(`/api/users/${ctx.manager.user.id}`, { active: false });
    expect(res.status).toBe(400);
  });
});
