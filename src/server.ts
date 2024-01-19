import {Logger} from "winston";
import 'express-async-errors';
import cookieSession from 'cookie-session';
import hpp from "hpp";
import helmet from "helmet";
import cors from 'cors';
import compression from "compression";
import {isAxiosError} from "axios";

import { CustomError, IErrorResponse, winstonLogger } from '@fulbertgato/jobber-shared';
import { Application, Request, Response, json, urlencoded, NextFunction } from 'express';
import {StatusCodes} from "http-status-codes";
import * as http from "http";
import {Server} from "socket.io";
import {createAdapter} from "@socket.io/redis-adapter";
import {createClient} from "redis";
import {config} from "./config";
import {elasticSearch} from "./elasticsearch";
import {appRoutes} from "./routes";
const  SERVER_PORT  =  4000 ;
const DEFAULT_ERROR_CODE = 500;
const log: Logger = winstonLogger(`${config.ELASTIC_SEARCH_URL}`,'apiGatewayServer','debug');

export class GatewayServer {
    private  app :  Application ;


    constructor ( app :  Application  ) {
        this.app  =  app ;
    }

    public  start () {
        this.securityMiddleware(this.app);
        this.standardMiddleware(this.app);
        this.routesMiddleware(this.app);
        this.startElasticSearch();
        this.errorHandler(this.app);
        this.startServer(this.app);

    }

    private  securityMiddleware (app :  Application) {
        app.set('trust proxy', 1) // trust first proxy
        app.use(
            cookieSession({
                name: 'session',
                keys: [`${config.SECRET_KEY_ONE}`, `${config.SECRET_KEY_TWO}`],
                maxAge: 24 * 7 * 3600000 ,
                secure: config.NODE_ENV === 'production',
                // sameSite: 'none' //update from config
            })
        );
        app.use(hpp());
        app.use(helmet());
        app.use(cors({
            origin: config.CLIENT_URL,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
        }));
    }

    private standardMiddleware(app: Application): void {
        app.use(compression());
        app.use(json({ limit: '200mb' }));
        app.use(urlencoded({ extended: true, limit: '200mb' }));
    }

    private routesMiddleware(app: Application): void {
        appRoutes(app);
    }

    private startElasticSearch(): void {
        elasticSearch.checkConnection();
    }
    private errorHandler(app: Application): void {
        app.use('*', (req: Request, res: Response, next: NextFunction) => {
            const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
            log.log('error', `${fullUrl} endpoint does not exist.`, '');
            res.status(StatusCodes.NOT_FOUND).json({ message: 'The endpoint called does not exist.'});
            next();
        });

        let use = app.use((error: IErrorResponse, _req: Request, res: Response, next: NextFunction) => {
            if (error instanceof CustomError) {
                log.log('error', `GatewayService ${error.comingFrom}:`, error);
                res.status(error.statusCode).json(error.serializeErrors());
            }

            if (isAxiosError(error)) {
                log.log('error', `GatewayService Axios Error - ${error?.response?.data?.comingFrom}:`, error);
                res.status(error?.response?.data?.statusCode ?? DEFAULT_ERROR_CODE).json({ message: error?.response?.data?.message ?? 'Error occurred.' });
            }
            next();
        });
    }

    private async startServer(app: Application): Promise<void> {
        try {
            const httpServer: http.Server = new http.Server(app);
            const socketIO: Server = await this.createSocketIO(httpServer);
            this.startHttpServer(httpServer);
            this.socketIOConnections(socketIO);
        } catch (error) {
            log.log('error', 'GatewayService startServer() error method:', error);
        }
    }

    private async createSocketIO(httpServer: http.Server): Promise<Server> {
        const io: Server = new Server(httpServer, {
            cors: {
                origin: config.CLIENT_URL,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
            }
        });
        const pubClient = createClient({ url: '' });
        const subClient = pubClient.duplicate();
        await Promise.all([pubClient.connect(), subClient.connect()]);
        io.adapter(createAdapter(pubClient, subClient));
        let socketIO = io;
        return io;
    }

    private async startHttpServer(httpServer: http.Server): Promise<void> {
        try {
            log.info(`Gateway server has started with process id ${process.pid}`);
            httpServer.listen(SERVER_PORT, () => {
                log.info(`Gateway server running on port ${SERVER_PORT}`);
            });
        } catch (error) {
            log.log('error', 'GatewayService startServer() error method:', error);
        }
    }

    private socketIOConnections(io: Server): void {
        // const socketIoApp = new SocketIOAppHandler(io);
        // socketIoApp.listen();
    }
}