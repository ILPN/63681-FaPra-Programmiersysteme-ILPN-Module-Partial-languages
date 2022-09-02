import { Injectable } from '@angular/core';

import { Arc, Breakpoint } from '../classes/diagram/arc';
import { Element } from '../classes/diagram/element';
import { hasCycles } from '../classes/diagram/functions/cycles.fn';
import {
    copyRun,
    getEmptyRun,
} from '../classes/diagram/functions/run-helper.fn';
import { Run } from '../classes/diagram/run';
import { StatehandlerService } from './moving/statehandler/statehandler.service';
import { eventSize } from './svg/svg-constants';

type Layer = Element | Breakpoint;

@Injectable({
    providedIn: 'root',
})
export class LayoutService {
    private static readonly MIN_HEIGHT = 400;
    private static readonly OFFSET = 20;
    private static readonly RANGE = 300;
    private static readonly ELEMENT_HEIGHT = 80;
    private static readonly LAYER_WIDTH = 100;

    constructor(private stateHandler: StatehandlerService) {}

    layout(run: Run, positionOffset = 0): { run: Run; diagrammHeight: number } {
        let runClone: Run = copyRun(run, true);
        let diagrammHeight = 0;
        //let diagrammWidth = 0;
        //if run hast no cycles use sugiyama layout
        if (!hasCycles(runClone)) {
            const layers: Array<Layer[]> = this.assignLayers(runClone);
            this.addBreakpoints(runClone, layers);
            this.setFixedLayerPos(layers);
            this.minimizeCrossing(runClone, layers);
            this.updateLayerPos(layers);
            diagrammHeight = this.calculatePosition(layers, positionOffset);
            //diagrammWidht = layers.length * LayoutService.LAYER_WIDTH;
        } else {
            runClone = getEmptyRun();
        }

        return { run: runClone, diagrammHeight };
    }

    /**
     * Sets the layer of all elements of the run
     * All elements without incoming arcs are assigned to the next layer
     * The outgoing arcs of all elements in the current layer are deleted to identify the next layer
     * @param run run for which the layout is to be determined
     * @returns layers with elements and breakpoints
     */
    private assignLayers(run: Run): Array<Element[]> {
        const layers = new Array<Element[]>();
        const elements = [...run.elements];
        let arcs = run.arcs;

        while (elements.length > 0) {
            const layer = new Array<Element>();
            const elementsWithIncomingArcs = arcs
                .filter((a) => elements.find((e) => e.id == a.source))
                .map((a) =>
                    elements.find((element) => element.id === a.target)
                );
            //filter all elements without incoming arcs => add them to the current layer and remove their outgoing arcs
            elements
                .filter(
                    (element) =>
                        elementsWithIncomingArcs.findIndex(
                            (elementWithIncomingArcs) =>
                                elementWithIncomingArcs?.id === element.id
                        ) === -1
                )
                .forEach((element) => {
                    layer.push(element);

                    const indexOfElement = elements.findIndex(
                        (innerElement) => innerElement.id === element.id
                    );
                    elements.splice(indexOfElement, 1);

                    arcs = arcs.filter((a) => {
                        const indexInOutgoingArcs =
                            element.outgoingArcs.findIndex(
                                (arc) =>
                                    arc.source === a.source &&
                                    arc.target === a.target
                            );
                        return indexInOutgoingArcs === -1;
                    });
                });
            layers.push(layer);
        }
        return layers;
    }

    /**
     * Adds breakpoints to layers for arcs if there are layers between the source and target elements
     * 1. Loop through all layers
     *  2. Loop through all elements in the layer
     *   3. Loop through all outgoing arcs of the element
     *    4. check distance/layers between arc source and target
     *     5. add breakpoint to arc for each enclosed layer
     * @param currentRun run to parse
     * @param layers layers with elements and breakpoints
     */
    private addBreakpoints(currentRun: Run, layers: Array<Layer[]>): void {
        for (let i = 0; i < layers.length - 1; i++) {
            layers[i]
                .flatMap((element) =>
                    'outgoingArcs' in element
                        ? element.outgoingArcs
                        : new Array<Arc>()
                )
                .forEach((a: Arc) => {
                    //arc loop
                    const target = currentRun.elements.find(
                        (element) => element.id === a.target
                    );

                    //find layer of target
                    const targetLayerIndex = layers.findIndex(
                        (l) => l.findIndex((e) => e === target) >= 0
                    );

                    for (let y = i + 1; y < targetLayerIndex; y++) {
                        let b: Breakpoint;
                        //Breakpoint already exists?
                        if (a.breakpoints.length < y - i) {
                            b = {
                                x: 0,
                                y: 0,
                                arc: a,
                            };
                            a.breakpoints.push(b);
                        } else {
                            b = a.breakpoints[y - (i + 1)];
                        }
                        layers[y].push(b);
                    }

                    //remove unnecessary breakpoints
                    a.breakpoints.splice(targetLayerIndex - (i + 1));
                });
        }
    }

    /**
     * Rearrange order of elements/breakpoints per layer to minimize crossing of lines
     * For every layer check to optimal ordering with the lowest crossing of incoming and outgoing lines
     * Note: This will not always find the optimal order throughout all layers!
     * @param currentRun run to parse
     * @param layers layers with elements and breakpoints
     */
    private minimizeCrossing(currentRun: Run, layers: Array<Layer[]>): void {
        layers.forEach((layer, index) => {
            const layerTmp = new Array<Layer>();
            this.reorderLayer(currentRun, layers, layer, index, 0, layerTmp);
            layer.splice(0, layer.length);
            layer.push(...layerTmp);
        });
    }

    /**
     * Move elements/breakpoints with fixed positions in a layer
     * @param layers layers with elements and breakpoints
     */
    private setFixedLayerPos(layers: Array<Layer[]>): void {
        layers.forEach((layer) => {
            const layerTmp = [...layer]; //Copy original layer for traversing all elements (ignores position changes in the original layer)
            layerTmp.forEach((elm) => {
                const i = layer.indexOf(elm);
                let layerPos = elm.layerPos;
                if (layerPos && i != layerPos - 1) {
                    layerPos = Math.min(layerPos - 1, layer.length - 1);
                    layer[i] = layer[layerPos];
                    layer[layerPos] = elm;
                }
            });
        });
    }

    /**
     * Save the position in a layer for each element and breakpoint
     * @param layers layers with elements and breakpoints
     */
    private updateLayerPos(layers: Array<Layer[]>): void {
        layers.forEach((layer) => {
            for (let i = 0; i < layer.length; i++) {
                layer[i].layerPos = i;
            }
        });
    }

    /**
     * Find the optimal order for a single layer
     * @param currentRun run to parse
     * @param layers all layers
     * @param layer current layer
     * @param layerIndex index of current layer
     * @param currentLayerPositon current position in the layer which must be filled with an element
     * @param reorderedLayer layer with rearranged order
     * @returns number of crossings
     */
    private reorderLayer(
        currentRun: Run,
        layers: Array<Layer[]>,
        layer: Layer[],
        layerIndex: number,
        currentLayerPositon: number,
        reorderedLayer: Layer[]
    ): number {
        let min = this.countCrossings(currentRun, layers, layerIndex);
        let minLayer = layer;

        const tmp = layer[currentLayerPositon];

        if (currentLayerPositon == layer.length - 1) {
            const crossings = this.countCrossings(
                currentRun,
                layers,
                layerIndex
            );
            if (crossings < min) {
                min = crossings;
                minLayer = [...layer];
            }
        } else {
            //Loop through all remaining elements and set each element once to the current position
            for (let i = currentLayerPositon + 1; i < layer.length; i++) {
                //ignore elements/breakpoints with fixed positions
                if (!layer[i].layerPos && !tmp.layerPos) {
                    layer[currentLayerPositon] = layer[i];
                    layer[i] = tmp;
                }
                const layerTmp = new Array<Layer>();
                const crossings = this.reorderLayer(
                    currentRun,
                    layers,
                    layer,
                    layerIndex,
                    currentLayerPositon + 1,
                    layerTmp
                );
                if (crossings < min) {
                    min = crossings;
                    minLayer = layerTmp;
                }
                if (!layer[i].layerPos && !tmp.layerPos) {
                    layer[i] = layer[currentLayerPositon];
                    layer[currentLayerPositon] = tmp;
                }
            }
        }

        reorderedLayer.push(...minLayer);
        return min;
    }

    /**
     * Identifies the number of crossing between the actual and previous/next layer
     * @param currentRun run to parse
     * @param layers all layers
     * @param layerIndex index of the current layer
     * @returns number of crossings
     */
    private countCrossings(
        currentRun: Run,
        layers: Array<Layer[]>,
        layerIndex: number
    ): number {
        const connections: ElementArrows = {
            incoming: [],
            outgoing: [],
        };
        layers[layerIndex].forEach((e, index) => {
            const layerInfo = {
                layers,
                index,
                layerIndex,
            };
            if ('id' in e) {
                //Check outgoing and incoming lines from element to the next/previous breakpoint or element
                connections.incoming.push(
                    ...this.findIncomingConnections(e.incomingArcs, layerInfo)
                );
                connections.outgoing.push(
                    ...this.findOutgoingConnections(e.outgoingArcs, layerInfo)
                );
            } else {
                this.getElementArrowsFromBreakpoint(
                    currentRun,
                    connections,
                    e as Breakpoint,
                    layerInfo
                );
            }
        });

        return (
            this.calculateCrossings(connections.incoming) +
            this.calculateCrossings(connections.outgoing)
        );
    }

    private getElementArrowsFromBreakpoint(
        currentRun: Run,
        connections: ElementArrows,
        breakpoint: Breakpoint,
        layerInfo: LayerInfoParameter
    ): void {
        //check incoming and outgoing line from breakpoint to the next/previous breakpoint or element
        let prev: Layer | undefined;
        let next: Layer | undefined;

        const layers = layerInfo.layers;
        const index = layerInfo.index;
        const layerIndex = layerInfo.layerIndex;
        const breakpointIndex = breakpoint.arc.breakpoints.indexOf(breakpoint);

        const source = currentRun.elements.find(
            (element) => element.id === breakpoint.arc.source
        );
        if (breakpointIndex == 0 && source) {
            prev = source;
        } else if (breakpointIndex > 0) {
            prev = breakpoint.arc.breakpoints[breakpointIndex - 1];
        }

        const target = currentRun.elements.find(
            (element) => element.id === breakpoint.arc.target
        );
        if (
            breakpointIndex == breakpoint.arc.breakpoints.length - 1 &&
            target
        ) {
            next = target;
        } else if (breakpoint.arc.breakpoints.length > breakpointIndex + 1) {
            next = breakpoint.arc.breakpoints[breakpointIndex + 1];
        }

        if (prev) {
            connections.incoming.push({
                sourcePos: layers[layerIndex - 1].indexOf(prev),
                targetPos: index,
            });
        }

        if (next) {
            connections.outgoing.push({
                sourcePos: index,
                targetPos: layers[layerIndex + 1].indexOf(next),
            });
        }
    }

    /**
     *
     * @param arcs
     * @param layerInfo
     * @private
     */
    private findIncomingConnections(
        arcs: Arc[],
        layerInfo: LayerInfoParameter
    ) {
        const layers = layerInfo.layers;
        const index = layerInfo.index;
        const layerIndex = layerInfo.layerIndex;
        const incomings = new Array<Connection>();
        arcs.forEach((arc) => {
            let sourcePos: number | undefined;
            if (arc.breakpoints.length > 0) {
                sourcePos = layers[layerIndex - 1].indexOf(
                    arc.breakpoints[arc.breakpoints.length - 1]
                );
            } else {
                sourcePos = layers[layerIndex - 1].findIndex(
                    (layer) => 'id' in layer && layer.id === arc.source
                );
            }

            if (sourcePos >= 0)
                incomings.push({
                    sourcePos: sourcePos,
                    targetPos: index,
                });
        });
        return incomings;
    }

    /**
     *
     * @param arcs
     * @param layerInfo
     * @private
     */
    private findOutgoingConnections(
        arcs: Arc[],
        layerInfo: LayerInfoParameter
    ): Connection[] {
        const layers = layerInfo.layers;
        const index = layerInfo.index;
        const layerIndex = layerInfo.layerIndex;
        const outgoings = new Array<Connection>();
        arcs.forEach((arc) => {
            let targetPos: number | undefined;
            if (arc.breakpoints.length > 0) {
                targetPos = layers[layerIndex + 1].indexOf(arc.breakpoints[0]);
            } else {
                targetPos = layers[layerIndex + 1].findIndex(
                    (layer) => 'id' in layer && layer.id === arc.target
                );
            }

            if (targetPos >= 0)
                outgoings.push({
                    sourcePos: index,
                    targetPos: targetPos,
                });
        });
        return outgoings;
    }

    /**
     *
     * @param connections
     * @private
     */
    private calculateCrossings(connections: Array<Connection>): number {
        let crossings = 0;
        connections.forEach((e, index) => {
            for (let i = index + 1; i < connections.length; i++) {
                if (
                    (e.sourcePos < connections[i].sourcePos &&
                        e.targetPos > connections[i].targetPos) ||
                    (e.sourcePos > connections[i].sourcePos &&
                        e.targetPos < connections[i].targetPos)
                ) {
                    crossings++;
                }
            }
        });
        return crossings;
    }

    /**
     * Sets the position of elements and breakpoints based on their layer and location in the layer
     * @param layers layers with elements and breakpoints
     * @param verticalOffset vertical offset for the current diagramm
     */
    private calculatePosition(
        layers: Array<Layer[]>,
        verticalOffset: number
    ): number {
        let height = LayoutService.MIN_HEIGHT;

        //calculate the diagram height based on the largest layer
        layers.forEach((layer) => {
            height = Math.max(
                height,
                layer.length * LayoutService.ELEMENT_HEIGHT
            );
        });

        layers.forEach((layer, index) => {
            const s = layer.length;
            const offsetY =
                (height - s * LayoutService.ELEMENT_HEIGHT) / (s + 1);

            const offsetX = LayoutService.LAYER_WIDTH * (index + 1);

            layer.forEach((el, idx) => {
                el.x = offsetX;
                el.y =
                    offsetY * (idx + 1) +
                    idx * LayoutService.ELEMENT_HEIGHT +
                    verticalOffset;
            });
        });

        return height;
    }

    public centerRuns(runs: Run[], centerX: number, centerY: number): void {
        let runBoundsXMin = Math.min(),
            runBoundsXMax = Math.max(),
            runBoundsYMin = Math.min(),
            runBoundsYMax = Math.max();
        runs.forEach((run) => {
            run.elements.forEach((e) => {
                if ((e.x ?? 0) < runBoundsXMin) {
                    runBoundsXMin = e.x ?? 0;
                }
                if ((e.x ?? 0) > runBoundsXMax - eventSize) {
                    runBoundsXMax = (e.x ?? 0) + eventSize;
                }
                if ((e.y ?? 0) < runBoundsYMin) {
                    runBoundsYMin = e.y ?? 0;
                }
                if ((e.y ?? 0) > runBoundsYMax - eventSize) {
                    runBoundsYMax = (e.y ?? 0) + eventSize;
                }
            });
            run.arcs.forEach((arc) => {
                arc.breakpoints.forEach((e) => {
                    if ((e.x ?? 0) < runBoundsXMin) {
                        runBoundsXMin = e.x ?? 0;
                    }
                    if ((e.x ?? 0) > runBoundsXMax) {
                        runBoundsXMax = e.x ?? 0;
                    }
                    if ((e.y ?? 0) < runBoundsYMin) {
                        runBoundsYMin = e.y ?? 0;
                    }
                    if ((e.y ?? 0) > runBoundsYMax) {
                        runBoundsYMax = e.y ?? 0;
                    }
                });
            });
        });

        const centerRunX = runBoundsXMin + (runBoundsXMax - runBoundsXMin) / 2;
        const centerRunY = runBoundsYMin + (runBoundsYMax - runBoundsYMin) / 2;
        const offsetX = Math.round(centerX - centerRunX);
        const offsetY = Math.round(centerY - centerRunY);

        if (runs.length == 1) {
            runs[0].offset = { x: offsetX, y: offsetY };
            this.stateHandler.resetOffset(runs[0].offset);
        } else {
            runs.forEach((run) => {
                run.elements.forEach((e) => {
                    e.x = (e.x ?? 0) + offsetX;
                    e.y = (e.y ?? 0) + offsetY;
                });
                run.arcs.forEach((arc) => {
                    arc.breakpoints.forEach((e) => {
                        e.x = (e.x ?? 0) + offsetX;
                        e.y = (e.y ?? 0) + offsetY;
                    });
                });
            });
        }
    }
}

type Connection = {
    sourcePos: number;
    targetPos: number;
};

type ElementArrows = {
    incoming: Connection[];
    outgoing: Connection[];
};

type LayerInfoParameter = {
    layers: Array<Layer[]>;
    layerIndex: number;
    index: number;
};
