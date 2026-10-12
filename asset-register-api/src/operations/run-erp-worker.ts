import {validateRuntimeConfiguration} from '../common/runtime-config';
import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {Module} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';
import {DatabaseModule} from '../database.module';
import {ErpSnapshotService,erpConfiguration} from './erp-snapshot.service';
@Module({imports:[ConfigModule.forRoot({isGlobal:true}),DatabaseModule],providers:[ErpSnapshotService]}) class WorkerModule{}
async function main(){const app=await NestFactory.createApplicationContext(WorkerModule);let running=true;const stop=()=>{running=false;};process.on('SIGTERM',stop);process.on('SIGINT',stop);try{validateRuntimeConfiguration();if(!erpConfiguration())throw new Error('ERP snapshot receiver must be configured before starting the worker');const worker=app.get(ErpSnapshotService);while(running){try{if(await worker.runOne())continue;}catch{console.error('ERP worker check failed; retrying.');}await new Promise(resolve=>setTimeout(resolve,1000));}}finally{await app.close();}}
void main().catch(()=>{console.error('ERP worker stopped: verify configuration and database availability.');process.exitCode=1;});
