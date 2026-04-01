import { getProgramPath, wLogger } from '@tosu/common';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

import { Statistics } from '@/states/types';
import { ModsLazer } from '@/utils/osuMods.types';

type RpcResponse<T> = {
    id: string;
    result?: T;
    error?: {
        message: string;
    };
};

type ApiModDto = {
    acronym: string;
    settings?: Record<string, unknown>;
};

type ScoreRequest = {
    statistics: Statistics;
    accuracy: number;
    combo: number;
    passedObjects?: number;
};

export type PreparedOsuBeatmap = {
    arConverted: number;
    csConverted: number;
    hpConverted: number;
    odConverted: number;
    hitWindow: number;
    circles: number;
    sliders: number;
    spinners: number;
    maxCombo: number;
    stars: number;
    aim: number;
    speed: number;
    flashlight: number;
    sliderFactor: number;
};

export type OfficialPerformanceResult = {
    stars: number;
    pp: number;
    ppAccuracy: number;
    ppAim: number;
    ppFlashlight: number;
    ppSpeed: number;
};

class OfficialOsuPerformanceService {
    private process?: ChildProcessWithoutNullStreams;
    private started = false;
    private requestId = 0;
    private readonly pending = new Map<
        string,
        {
            resolve: (value: unknown) => void;
            reject: (error: Error) => void;
        }
    >();

    async prepareBeatmap(params: {
        cacheKey: string;
        isLazer: boolean;
        mapPath: string;
        mods: ModsLazer;
    }) {
        return this.request<PreparedOsuBeatmap>('prepare_beatmap', {
            cacheKey: params.cacheKey,
            isLazer: params.isLazer,
            mapPath: params.mapPath,
            mods: params.mods as ApiModDto[]
        });
    }

    async calculatePerformances(params: {
        cacheKey: string;
        scores: ScoreRequest[];
    }) {
        return this.request<OfficialPerformanceResult[]>(
            'calculate_performances',
            params
        );
    }

    private async request<T>(method: string, params: unknown): Promise<T> {
        this.ensureStarted();

        const id = `${++this.requestId}`;
        const payload = JSON.stringify({ id, method, params });

        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, {
                resolve: resolve as (value: unknown) => void,
                reject
            });

            try {
                this.process?.stdin.write(`${payload}\n`);
            } catch (error) {
                this.pending.delete(id);
                reject(
                    error instanceof Error ? error : new Error(String(error))
                );
            }
        });
    }

    private ensureStarted() {
        if (this.started && this.process && !this.process.killed) {
            return;
        }

        const { command, args, cwd } = this.getSpawnTarget();
        this.process = spawn(command, args, {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true
        });
        this.started = true;

        const stdout = readline.createInterface({
            input: this.process.stdout
        });

        stdout.on('line', (line) => {
            let response: RpcResponse<unknown>;

            try {
                response = JSON.parse(line) as RpcResponse<unknown>;
            } catch {
                if (line.trim() !== '') {
                    wLogger.debug(`official-pp stdout:`, line);
                }
                return;
            }

            const pending = this.pending.get(response.id);
            if (!pending) {
                return;
            }

            this.pending.delete(response.id);

            if (response.error) {
                pending.reject(new Error(response.error.message));
                return;
            }

            pending.resolve(response.result);
        });

        this.process.stderr.on('data', (data) => {
            const message = data.toString().trim();
            if (message !== '') {
                wLogger.debug(`official-pp stderr:`, message);
            }
        });

        this.process.on('exit', (code, signal) => {
            const error = new Error(
                `official-pp helper exited (code=${code}, signal=${signal})`
            );

            for (const pending of this.pending.values()) {
                pending.reject(error);
            }

            this.pending.clear();
            this.process = undefined;
            this.started = false;
        });
    }

    private getSpawnTarget() {
        const runtime =
            process.platform === 'win32'
                ? 'win-x64'
                : `${process.platform}-x64`;
        const executable =
            process.platform === 'win32'
                ? 'tosu-official-pp.exe'
                : 'tosu-official-pp';

        const packagedPath = path.join(
            getProgramPath(),
            'target',
            'official-pp',
            runtime,
            executable
        );

        if (fs.existsSync(packagedPath)) {
            return {
                command: packagedPath,
                args: [],
                cwd: path.dirname(packagedPath)
            };
        }

        const projectPath = path.resolve(
            process.cwd(),
            'official-pp-helper',
            'official-pp-helper.csproj'
        );

        return {
            command: 'dotnet',
            args: [
                'run',
                '--project',
                projectPath,
                '--configuration',
                'Release',
                '--no-launch-profile',
                '--verbosity',
                'quiet'
            ],
            cwd: process.cwd()
        };
    }
}

export const officialOsuPerformance = new OfficialOsuPerformanceService();
