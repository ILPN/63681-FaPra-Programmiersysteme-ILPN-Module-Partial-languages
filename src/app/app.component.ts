import { Component } from '@angular/core';
import { Subject } from 'rxjs';

import { DownloadService } from './services/download/download.service';
import { UploadService } from './services/upload/upload.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
})
export class AppComponent {
    constructor(
        private _uploadService: UploadService,
        private _downloadService: DownloadService
    ) {}
    eventSubject: Subject<void> = new Subject<void>();

    emitEventToChild(): void {
        this.eventSubject.next();
    }

    public openFileSelector(): void {
        this._uploadService.openFileSelector();
    }

    public dropFiles(event: DragEvent): void {
        if (event.dataTransfer?.files) {
            this._uploadService.uploadFiles(event.dataTransfer.files);
        }
    }
}
