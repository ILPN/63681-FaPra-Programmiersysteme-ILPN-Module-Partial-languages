import { transitionSize } from '../../../services/svg/svg-constants';
import { Coordinates } from '../coordinates';

/**
 * Calculates the intersection of an event with a line
 * @param sourceX X position of the event center
 * @param sourceY Y position of the event center
 * @param targetX X Position of the arrow target
 * @param targetY Y Position of the arrow target
 * @param backwards false = Arrow starts at the event | false = Arrow ends at the event
 * @returns X and Y position
 */
export function getIntersection(
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number,
    backwards: boolean
): Coordinates {
    if (targetY == sourceY) {
        return {
            x: sourceX + (backwards ? -transitionSize : transitionSize) / 2,
            y: sourceY,
        };
    }

    const point = {
        x: sourceX + (backwards ? -transitionSize : transitionSize) / 2,
        y: 0,
    };
    const m = (targetY - sourceY) / (targetX - sourceX);
    const n = sourceY - sourceX * m;
    point.y =
        (sourceX + (backwards ? -transitionSize : transitionSize) / 2) * m + n;

    //Check if intersection is out of the event bounds -> Calculate intersection on the top/bottom line of the event
    if (point.y < sourceY - transitionSize / 2) {
        point.y = sourceY - transitionSize / 2;
        point.x = (point.y - n) / m;
    } else if (point.y > sourceY + transitionSize / 2) {
        point.y = sourceY + transitionSize / 2;
        point.x = (point.y - n) / m;
    }

    return point;
}
