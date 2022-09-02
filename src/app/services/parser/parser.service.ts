import { Injectable } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { Breakpoint } from 'src/app/classes/diagram/arc';

import { hasCycles } from '../../classes/diagram/functions/cycles.fn';
import {
    addArc,
    addElement,
    removeCycles,
    setRefs,
} from '../../classes/diagram/functions/run-helper.fn';
import {
    hasTransitiveArcs,
    removeTransitives,
} from '../../classes/diagram/functions/transitives.fn';
import { Run } from '../../classes/diagram/run';
import {
    arcsAttribute,
    eventsAttribute,
    offsetAttribute,
    typeKey,
} from './parsing-constants';

type ParsingStates = 'initial' | 'type' | 'events' | 'arcs' | 'offset';

@Injectable({
    providedIn: 'root',
})
export class ParserService {
    constructor(private toastr: ToastrService) {}
    readonly transitionRegex = /^(.*)(\[\d*])$/;
    readonly arcRegex = new RegExp(
        '^([^\\[ ]+)\\s([^\\[ ]+)(\\s?\\[\\d+\\])*$'
    );
    readonly breakpointRegex = new RegExp('\\[\\d+\\]');
    readonly offsetRegex = new RegExp('-?\\d+ -?\\d+');

    parse(content: string, errors: Set<string>): Run | null {
        const contentLines = content.split('\n');
        const run: Run = {
            text: content,
            arcs: [],
            elements: [],
            warnings: [],
            offset: { x: 0, y: 0 },
        };

        let currentParsingState: ParsingStates = 'initial';
        let fileContainsTransitions = false;
        let fileContainsArcs = false;
        let fileHasOffset = false;

        this.toastr.toasts.forEach((t) => {
            this.toastr.remove(t.toastId);
        });

        for (const line of contentLines) {
            const trimmedLine = line.trim();

            switch (currentParsingState) {
                case 'initial':
                    if (trimmedLine === '') {
                        break;
                    } else if (trimmedLine === typeKey) {
                        currentParsingState = 'type';
                        break;
                    } else {
                        errors.add(`The type has to be '` + typeKey + `'`);
                        this.toastr.error(
                            `The type has to be '` + typeKey + `'`,
                            `Unable to parse file`
                        );
                        return null;
                    }
                case 'type':
                    if (trimmedLine === '') {
                        break;
                    } else if (trimmedLine === eventsAttribute) {
                        currentParsingState = 'events';
                        fileContainsTransitions = true;
                        break;
                    } else if (trimmedLine === arcsAttribute) {
                        currentParsingState = 'arcs';
                        fileContainsArcs = true;
                        break;
                    } else {
                        errors.add(`The file contains invalid parts`);
                        this.toastr.error(
                            `The file contains invalid parts`,
                            `Unable to parse file`
                        );
                        return null;
                    }
                case 'events':
                    if (trimmedLine === '' || trimmedLine === eventsAttribute) {
                        break;
                    } else if (
                        trimmedLine !== arcsAttribute &&
                        trimmedLine !== offsetAttribute
                    ) {
                        const { id, label, layerPos } =
                            this.parseTransition(trimmedLine);

                        if (
                            !addElement(run, {
                                label: label,
                                layerPos: layerPos,
                                incomingArcs: [],
                                outgoingArcs: [],
                                id: id,
                            })
                        ) {
                            run.warnings.push(
                                `File contains duplicate events (${
                                    trimmedLine.split(' ')[0]
                                })`
                            );
                            this.toastr.warning(
                                `File contains duplicate events`,
                                `Duplicate events are ignored`
                            );
                        }
                        break;
                    } else if (trimmedLine === '.arcs') {
                        currentParsingState = 'arcs';
                        fileContainsArcs = true;
                        break;
                    } else if (trimmedLine === offsetAttribute) {
                        currentParsingState = 'offset';
                        break;
                    } else {
                        errors.add(`Unable to parse file`);
                        this.toastr.error(`Error`, `Unable to parse file`);
                        return null;
                    }
                case 'arcs':
                    if (trimmedLine === '' || trimmedLine === arcsAttribute) {
                        break;
                    } else if (trimmedLine === offsetAttribute) {
                        currentParsingState = 'offset';
                        break;
                    } else if (trimmedLine !== eventsAttribute) {
                        let source: string, target: string;
                        const breakpoints: Breakpoint[] = [];

                        if (this.arcRegex.test(trimmedLine)) {
                            const match = this.arcRegex.exec(trimmedLine);

                            if (match) {
                                source = match[1];
                                target = match[2];
                            } else {
                                const splitLine = trimmedLine.split(' ');
                                source = splitLine[0];
                                target = splitLine[1];
                            }

                            if (
                                !addArc(run, {
                                    source: source,
                                    target: target,
                                    breakpoints: breakpoints,
                                })
                            ) {
                                run.warnings.push(
                                    `File contains duplicate arc (${source} ${target})`
                                );
                                this.toastr.warning(
                                    `File contains duplicate arcs`,
                                    `Duplicate arcs are ignored`
                                );
                            } else {
                                const arc = run.arcs.find(
                                    (a) =>
                                        a.source === source &&
                                        a.target === target
                                );
                                if (arc) {
                                    let trimmedLineTmp = trimmedLine;
                                    while (
                                        this.breakpointRegex.test(
                                            trimmedLineTmp
                                        )
                                    ) {
                                        const layerPos = parseInt(
                                            trimmedLineTmp.substring(
                                                trimmedLineTmp.indexOf('[') + 1,
                                                trimmedLineTmp.indexOf(']')
                                            )
                                        );
                                        breakpoints.push({
                                            x: 0,
                                            y: 0,
                                            layerPos: layerPos,
                                            arc: arc,
                                        });
                                        arc.breakpoints = breakpoints;
                                        trimmedLineTmp =
                                            trimmedLineTmp.substring(
                                                trimmedLineTmp.indexOf(']') + 1
                                            );
                                    }
                                }
                            }
                        } else {
                            run.warnings.push(`File contains invalid arcs`);
                            this.toastr.warning(
                                `Invalid arcs are ignored`,
                                `File contains invalid arcs`
                            );
                        }
                        break;
                    } else if (trimmedLine === eventsAttribute) {
                        currentParsingState = 'events';
                        fileContainsTransitions = true;
                        break;
                    } else {
                        errors.add(`Unable to parse file`);
                        this.toastr.error(`Error`, `Unable to parse file`);
                        return null;
                    }
                case 'offset':
                    if (
                        trimmedLine === '' ||
                        trimmedLine === offsetAttribute ||
                        fileHasOffset
                    ) {
                        break;
                    } else if (this.offsetRegex.test(trimmedLine)) {
                        const matches = this.offsetRegex.exec(trimmedLine);
                        if (matches) {
                            fileHasOffset = true;
                            const coordinates = matches[0].split(' ');
                            run.offset = {
                                x: parseInt(coordinates[0]),
                                y: parseInt(coordinates[1]),
                            };
                        }
                    }
            }
        }
        if (fileContainsTransitions && fileContainsArcs) {
            if (!setRefs(run)) {
                run.warnings.push(`File contains arcs for non existing events`);
                this.toastr.warning(
                    `File contains arcs for non existing events`,
                    `Invalid arcs are ignored`
                );
            }
            if (hasCycles(run)) {
                removeCycles(run);
                run.warnings.push(`File contains cyclic arcs`);
                this.toastr.warning(
                    `Cyclic arcs are ignored`,
                    `File contains cyclic arcs`
                );
            }
            if (hasTransitiveArcs(run)) {
                removeTransitives(run);
                run.warnings.push(`File contains transitive arcs`);
                this.toastr.warning(
                    `Transitive arcs are ignored`,
                    `File contains transitive arcs`
                );
                setRefs(run);
            }

            return run;
        } else {
            errors.add(`File does not contain events and arcs`);
            this.toastr.error(
                `File does not contain events and arcs`,
                `Unable to parse file`
            );
            return null;
        }
    }

    private parseTransition(trimmedLine: string): {
        label: string;
        id: string;
        layerPos: number | undefined;
    } {
        let id: string;
        let label: string;
        let layerPos: number | undefined;

        let textToCheckForLabel = trimmedLine;

        const match = this.transitionRegex.exec(trimmedLine);
        if (match) {
            textToCheckForLabel = match[1];
            if (match[2]) {
                //extract coordinates
                layerPos = parseInt(
                    match[2].substring(
                        match[2].indexOf('[') + 1,
                        match[2].indexOf(']')
                    )
                );
            }
        }

        if (textToCheckForLabel.includes('|')) {
            const splittLine = textToCheckForLabel.split('|');
            id = splittLine[0].trim();
            label = splittLine[1].trim();
        } else {
            id = textToCheckForLabel.trim();
            label = textToCheckForLabel.trim();
        }

        return {
            id,
            label,
            layerPos,
        };
    }
}
