import {
    AfterViewInit,
    Component,
    ElementRef,
    Input,
    OnDestroy,
    OnInit,
    ViewChild,
} from '@angular/core';
import {
    BehaviorSubject,
    map,
    Observable,
    Subscription,
    switchMap,
    tap,
} from 'rxjs';

import { CoordinatesInfo } from '../../classes/diagram/coordinates';
import { Run } from '../../classes/diagram/run';
import { ColorService } from '../../services/color.service';
import { DisplayService } from '../../services/display.service';
import { LayoutService } from '../../services/layout.service';
import { SvgService } from '../../services/svg/svg.service';
import { CanvasComponent } from '../canvas/canvas.component';
import {
    removeCoordinates,
    updateCoordsInText,
} from '../source-file-textarea/update-coords-in-text.fn';
import { MergeService } from './merge.service';

@Component({
    selector: 'app-display-merged-run',
    templateUrl: './display-merged-run.component.html',
    styleUrls: ['./display-merged-run.component.scss'],
})
export class DisplayMergedRunComponent
    implements OnInit, OnDestroy, AfterViewInit
{
    @Input()
    resetEvent?: Observable<void>;

    svgElements$: Observable<SVGElement[]> | undefined;

    @ViewChild('canvas') canvas: CanvasComponent | undefined;
    @ViewChild('svg_wrapper') svgWrapper: ElementRef<HTMLElement> | undefined;

    private _sub?: Subscription;
    private _colorSub?: Subscription;
    private _highlightSub?: Subscription;
    private highlight = false;

    private primeEventStructure?: Run;
    private manualUpdateTrigger = new BehaviorSubject<void>(undefined);

    constructor(
        private mergeService: MergeService,
        private layoutService: LayoutService,
        private svgService: SvgService,
        private _colorService: ColorService
    ) {}

    ngOnInit(): void {
        this.update();

        this._colorSub = this._colorService
            .getHighlightColor()
            .subscribe(() => {
                this.update();
            });
        this._highlightSub = this._colorService
            .getHighlightSelection()
            .subscribe((highlight) => {
                this.highlight = highlight;
                this.update();
            });

        this.resetEvent?.subscribe(() => {
            if (!this.primeEventStructure) {
                return;
            }

            this.primeEventStructure.text = removeCoordinates(
                this.primeEventStructure.text
            );
            this.manualUpdateTrigger.next();
        });
    }

    ngAfterViewInit(): void {
        const observer = new ResizeObserver((entries) => {
            entries.forEach(() => {
                this.update();
            });
        });
        if (this.svgWrapper) {
            observer.observe(this.svgWrapper.nativeElement);
        }
    }

    ngOnDestroy(): void {
        this._sub?.unsubscribe();
        this._colorSub?.unsubscribe();
        this._highlightSub?.unsubscribe();
    }

    private update(): void {
        this.svgElements$ = this.mergeService.getMergedRun$().pipe(
            tap(
                (primeEventStructure) =>
                    (this.primeEventStructure = primeEventStructure)
            ),
            switchMap((primeEventStructure) =>
                this.manualUpdateTrigger.pipe(map(() => primeEventStructure))
            ),
            map(
                (primeEventStructure) =>
                    this.layoutService.layout(primeEventStructure).run
            ),
            map((modifiedRun) => {
                if (
                    this.canvas &&
                    this.canvas.drawingArea &&
                    (!modifiedRun.offset ||
                        (!modifiedRun.offset.x && !modifiedRun.offset.y))
                ) {
                    const w = this.canvas.drawingArea.nativeElement.clientWidth;
                    const h =
                        this.canvas.drawingArea.nativeElement.clientHeight;
                    if (w > 0 && h > 0)
                        this.layoutService.centerRuns(
                            [modifiedRun],
                            w / 2,
                            h / 2
                        );
                }
                return this.svgService.createSvgElements(
                    modifiedRun,
                    this.highlight
                );
            })
        );
    }

    updateTextInMergedRun(coordinates: CoordinatesInfo[]): void {
        if (!this.primeEventStructure) {
            return;
        }

        this.primeEventStructure.text = updateCoordsInText(
            this.primeEventStructure.text,
            coordinates
        );
    }
}
