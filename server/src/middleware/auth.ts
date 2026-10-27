import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../errors';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface GroupContext {
  id: string;
  name: string;
  currency: string;
  createdById: string;
}

export interface MemberContext {
  id: string;
  role: string;
}

// Augment Express Request declaration
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      group?: GroupContext;
      groupMember?: MemberContext;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_jwt_key_at_least_32_characters_long';

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): AuthUser {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    return payload;
  } catch {
    throw new UnauthorizedError('Invalid or expired authentication token');
  }
}

/**
 * Middleware ensuring user is authenticated via Bearer token header or cookie.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      throw new UnauthorizedError('Authentication token required');
    }

    const decoded = verifyToken(token);

    // Verify user exists in DB
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      throw new UnauthorizedError('User account not found or deactivated');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware ensuring authenticated user is an active member of the specified group.
 * Group id is extracted from req.params.id or req.params.groupId.
 */
export async function requireGroupMember(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const groupId = (req.params.id || req.params.groupId) as string;
    if (!groupId) {
      throw new NotFoundError('Group ID missing from request parameters');
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        currency: true,
        createdById: true,
      },
    });

    if (!group) {
      throw new NotFoundError(`Group with ID "${groupId}" does not exist`);
    }

    const member = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: req.user.id,
        },
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!member) {
      throw new ForbiddenError('You are not a member of this group');
    }

    req.group = group;
    req.groupMember = member;
    next();
  } catch (err) {
    next(err);
  }
}
