import { TestBed } from '@angular/core/testing';

import { DisplayService } from '../display.service';
import { DownloadService } from './download.service';

describe('ParserService', () => {
    let service: DownloadService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [{ provide: DisplayService, useValue: {} }],
        });
        service = TestBed.inject(DownloadService);
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });
});
