import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppModule } from '../app.module';
import { User } from '../users/entities/user.entity';
import { AdminRole } from '../admin/entities/admin-role.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';

describe('Users Controller E2E', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let adminRoleRepository: Repository<AdminRole>;
  let jwtService: JwtService;

  let regularUser: User;
  let adminUser: User;
  let targetUser: User;
  let regularUserToken: string;
  let adminUserToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        TypeOrmModule.forFeature([User, AdminRole]),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userRepository = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    adminRoleRepository = moduleFixture.get<Repository<AdminRole>>(getRepositoryToken(AdminRole));
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Create test users
    regularUser = await userRepository.save({
      username: 'regularuser',
      email: 'regular@example.com',
      walletAddress: 'GREGULAR1234567890123456789012345678901234567890',
      isArtist: false,
    });

    adminUser = await userRepository.save({
      username: 'adminuser',
      email: 'admin@example.com',
      walletAddress: 'GADMIN1234567890123456789012345678901234567890',
      isArtist: false,
    });

    targetUser = await userRepository.save({
      username: 'targetuser',
      email: 'target@example.com',
      walletAddress: 'GTARGET1234567890123456789012345678901234567890',
      isArtist: false,
    });

    // Create admin role for admin user
    await adminRoleRepository.save({
      userId: adminUser.id,
      permissions: ['user_management'],
    });

    // Generate JWT tokens
    regularUserToken = jwtService.sign({
      sub: regularUser.id,
      walletAddress: regularUser.walletAddress,
      isArtist: regularUser.isArtist,
    });

    adminUserToken = jwtService.sign({
      sub: adminUser.id,
      walletAddress: adminUser.walletAddress,
      isArtist: adminUser.isArtist,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PATCH /users/:id (Update User)', () => {
    const updateData = {
      username: 'updated-username',
    };

    it('should allow user to update their own profile', async () => {
      return request(app.getHttpServer())
        .patch(`/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send(updateData)
        .expect(200)
        .then((response) => {
          expect(response.body.username).toBe(updateData.username);
        });
    });

    it('should allow admin to update any user profile', async () => {
      return request(app.getHttpServer())
        .patch(`/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${adminUserToken}`)
        .send(updateData)
        .expect(200);
    });

    it('should deny regular user from updating another user profile', async () => {
      return request(app.getHttpServer())
        .patch(`/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send(updateData)
        .expect(403)
        .then((response) => {
          expect(response.body.message).toContain(
            'You can only perform this action on your own account or need admin privileges',
          );
        });
    });

    it('should deny access without authentication', async () => {
      return request(app.getHttpServer())
        .patch(`/users/${targetUser.id}`)
        .send(updateData)
        .expect(401);
    });

    it('should deny access with invalid token', async () => {
      return request(app.getHttpServer())
        .patch(`/users/${targetUser.id}`)
        .set('Authorization', 'Bearer invalid-token')
        .send(updateData)
        .expect(401);
    });
  });

  describe('DELETE /users/:id (Soft Delete)', () => {
    let softDeleteTargetUser: User;

    beforeEach(async () => {
      softDeleteTargetUser = await userRepository.save({
        username: 'softdeletetarget',
        email: 'softdelete@example.com',
        walletAddress: 'GSOFTDELETE1234567890123456789012345678901234567890',
        isArtist: false,
      });
    });

    it('should allow user to delete their own account', async () => {
      return request(app.getHttpServer())
        .delete(`/users/${softDeleteTargetUser.id}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(204);
    });

    it('should allow admin to delete any user account', async () => {
      return request(app.getHttpServer())
        .delete(`/users/${softDeleteTargetUser.id}`)
        .set('Authorization', `Bearer ${adminUserToken}`)
        .expect(204);
    });

    it('should deny regular user from deleting another user account', async () => {
      return request(app.getHttpServer())
        .delete(`/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403)
        .then((response) => {
          expect(response.body.message).toContain(
            'You can only perform this action on your own account or need admin privileges',
          );
        });
    });

    it('should deny access without authentication', async () => {
      return request(app.getHttpServer())
        .delete(`/users/${softDeleteTargetUser.id}`)
        .expect(401);
    });
  });

  describe('DELETE /users/:id/hard (Hard Delete)', () => {
    let hardDeleteTargetUser: User;

    beforeEach(async () => {
      hardDeleteTargetUser = await userRepository.save({
        username: 'harddeletetarget',
        email: 'harddelete@example.com',
        walletAddress: 'GHARDDELETE1234567890123456789012345678901234567890',
        isArtist: false,
      });
    });

    it('should allow admin to hard delete any user account', async () => {
      return request(app.getHttpServer())
        .delete(`/users/${hardDeleteTargetUser.id}/hard`)
        .set('Authorization', `Bearer ${adminUserToken}`)
        .expect(204);
    });

    it('should deny regular user from hard deleting even their own account', async () => {
      return request(app.getHttpServer())
        .delete(`/users/${regularUser.id}/hard`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403)
        .then((response) => {
          expect(response.body.message).toContain(
            'You can only perform this action on your own account or need admin privileges',
          );
        });
    });

    it('should deny regular user from hard deleting another user account', async () => {
      return request(app.getHttpServer())
        .delete(`/users/${hardDeleteTargetUser.id}/hard`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);
    });

    it('should deny access without authentication', async () => {
      return request(app.getHttpServer())
        .delete(`/users/${hardDeleteTargetUser.id}/hard`)
        .expect(401);
    });
  });

  describe('POST /users/:id/restore (Restore User)', () => {
    let deletedUser: User;

    beforeEach(async () => {
      deletedUser = await userRepository.save({
        username: 'deleteduser',
        email: 'deleted@example.com',
        walletAddress: 'GDELETED1234567890123456789012345678901234567890',
        isArtist: false,
        isDeleted: true,
        deletedAt: new Date(),
      });
    });

    it('should allow admin to restore a deleted user', async () => {
      return request(app.getHttpServer())
        .post(`/users/${deletedUser.id}/restore`)
        .set('Authorization', `Bearer ${adminUserToken}`)
        .expect(200)
        .then((response) => {
          expect(response.body.isDeleted).toBe(false);
          expect(response.body.deletedAt).toBeNull();
        });
    });

    it('should deny regular user from restoring even their own deleted account', async () => {
      return request(app.getHttpServer())
        .post(`/users/${deletedUser.id}/restore`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403)
        .then((response) => {
          expect(response.body.message).toContain(
            'You can only perform this action on your own account or need admin privileges',
          );
        });
    });

    it('should deny regular user from restoring another deleted user account', async () => {
      return request(app.getHttpServer())
        .post(`/users/${deletedUser.id}/restore`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);
    });

    it('should deny access without authentication', async () => {
      return request(app.getHttpServer())
        .post(`/users/${deletedUser.id}/restore`)
        .expect(401);
    });
  });

  describe('GET /users/:id (Read Access)', () => {
    it('should allow unauthenticated access to user profile', async () => {
      return request(app.getHttpServer())
        .get(`/users/${targetUser.id}`)
        .expect(200)
        .then((response) => {
          expect(response.body.id).toBe(targetUser.id);
        });
    });

    it('should allow authenticated access to user profile', async () => {
      return request(app.getHttpServer())
        .get(`/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(200);
    });
  });

  describe('Admin Status Edge Cases', () => {
    let suspendedAdminUser: User;
    let suspendedAdminToken: string;

    beforeEach(async () => {
      suspendedAdminUser = await userRepository.save({
        username: 'suspendedadmin',
        email: 'suspended@example.com',
        walletAddress: 'GSUSPENDED1234567890123456789012345678901234567890',
        isArtist: false,
        status: 'suspended',
      });

      await adminRoleRepository.save({
        userId: suspendedAdminUser.id,
        permissions: ['user_management'],
      });

      suspendedAdminToken = jwtService.sign({
        sub: suspendedAdminUser.id,
        walletAddress: suspendedAdminUser.walletAddress,
        isArtist: suspendedAdminUser.isArtist,
      });
    });

    it('should deny access for suspended admin users', async () => {
      return request(app.getHttpServer())
        .patch(`/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${suspendedAdminToken}`)
        .send({ username: 'should-not-work' })
        .expect(403)
        .then((response) => {
          expect(response.body.message).toContain(
            'You can only perform this action on your own account or need admin privileges',
          );
        });
    });
  });

  describe('Invalid User ID Handling', () => {
    it('should handle non-existent user ID gracefully', async () => {
      return request(app.getHttpServer())
        .patch('/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({ username: 'test' })
        .expect(404);
    });

    it('should handle invalid UUID format', async () => {
      return request(app.getHttpServer())
        .patch('/users/invalid-uuid')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({ username: 'test' })
        .expect(400);
    });
  });

  describe('Cross-User Access Prevention', () => {
    it('should prevent user A from accessing user B data even with valid token', async () => {
      const userBToken = jwtService.sign({
        sub: targetUser.id,
        walletAddress: targetUser.walletAddress,
        isArtist: targetUser.isArtist,
      });

      return request(app.getHttpServer())
        .patch(`/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ username: 'hacker-username' })
        .expect(403);
    });
  });
});
