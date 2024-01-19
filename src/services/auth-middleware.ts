import {NextFunction, Request, Response} from 'express';
import {IAuthPayload} from "@fulbertgato/jobber-shared/src/auth.interface";
import {verify} from "jsonwebtoken";
import {config} from "../config";
import {BadRequestError, UnauthorizedError} from "@fulbertgato/jobber-shared";

class AuthMiddleware {
    public verifyUser(req: Request, _res: Response, next: NextFunction): void {
        if (!req.session?.jwt) {
            throw new UnauthorizedError('Token is not available. Please login again.', 'GatewayService verifyUser() method error');
        }

        try {
            req.currentUser = verify(req.session?.jwt, `${config.JWT_TOKEN}`) as IAuthPayload;
        } catch (error) {
            throw new UnauthorizedError('Token is not available. Please login again.', 'GatewayService verifyUser() method invalid session error');
        }
        next();
    }

    public checkAuthentication(req: Request, _res: Response, next: NextFunction): void {
        if (!req.currentUser) {
            throw new BadRequestError('Authentication is required to access this route.', 'GatewayService checkAuthentication() method error');
        }
        next();
    }
}

export const authMiddleware: AuthMiddleware = new AuthMiddleware();