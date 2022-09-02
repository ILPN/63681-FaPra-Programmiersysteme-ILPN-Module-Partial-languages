import { Injectable } from '@angular/core';
import { map, Observable, shareReplay } from 'rxjs';

import { Arc } from '../../classes/diagram/arc';
import {
    doesElementBelongToCurrentRun,
    Element,
} from '../../classes/diagram/element';
import {
    copyRun,
    generateTextForRun,
    getEmptyRun,
    setRefs,
} from '../../classes/diagram/functions/run-helper.fn';
import { Run } from '../../classes/diagram/run';
import { DisplayService } from '../../services/display.service';

@Injectable({
    providedIn: 'root',
})
export class MergeService {
    private currentRuns$: Observable<Run[]>;

    private readonly mergedRun$: Observable<Run>;

    constructor(displayService: DisplayService) {
        this.currentRuns$ = displayService.runs$;

        this.mergedRun$ = displayService.runs$.pipe(
            map((runs) => this.mergeRuns(runs)),
            shareReplay(1)
        );
    }

    getMergedRun$(): Observable<Run> {
        return this.mergedRun$;
    }

    mergeRuns(runs: Run[]): Run {
        const primeEventStructure = getEmptyRun();
        let nextArcs: Array<Arc> = [];
        let nextElements: Array<Element> = [];
        /* erstelle einen neunen Run, und füge alle Events und Arcs hinzu.
        Um sicher zu stellen, dass die IDs eindeutig sind werden diese erneuert als 
        Kombination von Index und alter ID */
        if (runs.length === 0) {
            return getEmptyRun();
        } else {
            for (let index = 0; index < runs.length; index++) {
                const runToMerge = copyRun(runs[index], false);
                runToMerge.elements.forEach(
                    (element) => (element.id = index + '_' + element.id)
                );
                runToMerge.arcs.forEach((arc) => {
                    arc.source = index + '_' + arc.source;
                    arc.target = index + '_' + arc.target;
                });
                primeEventStructure.elements.push(...runToMerge.elements);
                primeEventStructure.arcs.push(...runToMerge.arcs);
            }
            let end = false;
            let first = true;
            /*Jetzt werden die Layer nacheinander Durchgegangen und geprüft ob es zwei
            Elemente gibt, welche das gleiche Label besitzen und alle einsteffen Arcs übereinstimmen.
            Diese werden gemerged, es sei denn sie stammen aus demselben Run und sollen somit Nebenläufig sein*/
            while (!end) {
                if (first) {
                    /*Am Anfang wird der erste Layer bearbeitet*/
                    primeEventStructure.elements.forEach((element) => {
                        if (element.incomingArcs.length == 0) {
                            nextElements.push(element);
                        }
                    });
                } else {
                    /* der nächste Layer besteht aus denjenige Elementen, bei denen alle Incoming Arcs bereits besucht
                    wurden */
                    primeEventStructure.elements.forEach((element) => {
                        let allIncomingArcs = true;
                        if (element.incomingArcs.length > 0) {
                            for (
                                let index = 0;
                                index < element.incomingArcs.length;
                                index++
                            ) {
                                if (
                                    !nextArcs.includes(
                                        element.incomingArcs[index]
                                    )
                                ) {
                                    allIncomingArcs = false;
                                }
                            }
                            if (allIncomingArcs) {
                                nextElements.push(element);
                                element.incomingArcs.forEach((arc) => {
                                    nextArcs = nextArcs.filter(
                                        (arc2) => arc != arc2
                                    );
                                });
                            }
                        }
                    });
                }

                if (nextElements.length > 1) {
                    /* Um die Ausnahme zu berücksichtigen, dass zwei Elemente aus einem Run stammen und diese gemerged werden
                    werden alle label bis auch den ersten provisorisch geändert */
                    for (
                        let index = 0;
                        index < nextElements.length - 1;
                        index++
                    ) {
                        for (
                            let index2 = index + 1;
                            index2 < nextElements.length;
                            index2++
                        ) {
                            if (
                                nextElements[index].label ==
                                    nextElements[index2].label &&
                                haveSameIncomingArcs(
                                    nextElements[index],
                                    nextElements[index2]
                                )
                            ) {
                                if (
                                    nextElements[index].id.split('_')[0] ==
                                    nextElements[index2].id.split('_')[0]
                                ) {
                                    nextElements[index2].label =
                                        nextElements[index2].label + '|';
                                }
                            }
                        }
                    }
                }
                /* Es folgt der eigentliche Merge Prozess */
                for (let index = 0; index < nextElements.length - 1; index++) {
                    for (
                        let index2 = index + 1;
                        index2 < nextElements.length;
                        index2++
                    ) {
                        if (
                            nextElements[index].label ==
                                nextElements[index2].label &&
                            haveSameIncomingArcs(
                                nextElements[index],
                                nextElements[index2]
                            )
                        ) {
                            nextElements[index2].outgoingArcs.forEach((arc) => {
                                arc.source = nextElements[index].id;
                                nextElements[index].outgoingArcs.push(arc);
                            });
                            if (
                                doesElementBelongToCurrentRun(
                                    nextElements[index2]
                                )
                            ) {
                                nextElements[index].currentRun = true;
                                nextElements[index].incomingArcs.forEach(
                                    (arc) => (arc.currentRun = true)
                                );
                            }

                            /*arcs die auf gemergte elements elements zeigen werden entfernt */
                            primeEventStructure.arcs =
                                primeEventStructure.arcs.filter(
                                    (arc) =>
                                        arc.target != nextElements[index2].id
                                );
                            /*gemergte elements werden entfernt */
                            primeEventStructure.elements =
                                primeEventStructure.elements.filter(
                                    (element) => element != nextElements[index2]
                                );

                            nextElements = nextElements.filter(
                                (element) => element != nextElements[index2]
                            );
                            index2 = index2 - 1;
                        }
                    }
                }

                /*outgoing Arcs werden besucht */
                nextElements.forEach((element) => {
                    element.outgoingArcs.forEach((arc) => {
                        nextArcs.push(arc);
                    });
                });

                nextElements = [];

                /*Schleife ist beendet sobald keine Kanten (outgoing Arcs) mehr besucht werden können*/
                if (nextArcs.length == 0) {
                    end = true;
                }
                first = false;
            }
            /*provisorische Label werden wieder zurückgesetzt  */
            primeEventStructure.elements.forEach((element) => {
                element.label = element.label.split('|')[0];
            });
            setRefs(primeEventStructure);
            primeEventStructure.text = generateTextForRun(primeEventStructure);
            return primeEventStructure;
        }
    }
}

function haveSameIncomingArcs(element1: Element, element2: Element): boolean {
    let haveSame = true;
    element1.incomingArcs.forEach((arc1) => {
        if (
            element2.incomingArcs.filter((arc2) => arc2.source === arc1.source)
                .length == 0
        ) {
            haveSame = false;
        }
    });
    if (haveSame) {
        element2.incomingArcs.forEach((arc2) => {
            if (
                element1.incomingArcs.filter(
                    (arc1) => arc2.source === arc1.source
                ).length == 0
            ) {
                haveSame = false;
            }
        });
    }
    return haveSame;
}
