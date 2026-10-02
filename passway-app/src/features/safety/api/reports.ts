import { callable } from '../../../firebase/client';
import type { FileReportRequest, FileReportResponse, ConnectionRequestBody, Empty } from '../../../types/contracts';

export const fileReport = callable<FileReportRequest, FileReportResponse>('fileReport');
export const blockUser = callable<ConnectionRequestBody, Empty>('blockUser');
