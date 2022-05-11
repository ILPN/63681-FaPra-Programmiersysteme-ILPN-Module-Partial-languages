import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { Run } from '../classes/diagram/run';

@Injectable({
    providedIn: 'root',
})
export class DisplayService implements OnDestroy {
    private _currentRun$: BehaviorSubject<Run>;

    private readonly _runs: Run[] = [];

    constructor() {
        this.runs.push(new Run());
        this._currentRun$ = new BehaviorSubject<Run>(this.runs[0]);
    }

    ngOnDestroy(): void {
        this._currentRun$.complete();
    }

    public get currentRun$(): Observable<Run> {
        return this._currentRun$.asObservable();
    }

    public get currentRun(): Run {
        return this._currentRun$.getValue();
    }
    private display(net: Run): void {
        this._currentRun$.next(net);
    }

    public get runs(): Run[] {
        return this._runs;
    }

    public addEmptyRun(): void {
        this.registerRun(new Run());
    }

    public registerRun(run: Run): void {
        //add run or update current run if empty
        if (this.currentRun.isEmpty()) {
            this.updateCurrentRun(run);
        } else {
            this.runs.push(run);
            this.display(run);
        }
    }

    public getRunIndex(run: Run): number {
        return this.runs.indexOf(run);
    }

    public updateCurrentRun(run: Run): void {
        const index = this.getRunIndex(this.currentRun);
        this.runs[index] = run;
        this.display(run);
    }

    public removeRun(run: Run): void {
        const index = this.getRunIndex(run);
        if (index > -1) {
            this.runs.splice(index, 1);
        }

        if (this.runs.length > 0) {
            this.display(this.runs[Math.max(index - 1, 0)]); //set previous run as active
        } else {
            this.addEmptyRun(); //create new empty run
        }
    }

    public removeCurrentRun(): void {
        this.removeRun(this.currentRun);
    }

    public clearRuns(): void {
        this.runs.splice(0, this.runs.length);
        this.addEmptyRun();
    }
}
