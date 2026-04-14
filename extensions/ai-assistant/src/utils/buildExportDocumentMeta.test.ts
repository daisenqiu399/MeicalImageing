import { DicomMetadataStore } from '@ohif/core';
import buildExportDocumentMeta from './buildExportDocumentMeta';

function createServicesManager(displaySet) {
  return {
    services: {
      displaySetService: {
        getDisplaySetByUID: jest.fn(uid => (uid === displaySet.displaySetInstanceUID ? displaySet : null)),
      },
      viewportGridService: {
        getActiveViewportId: jest.fn(() => 'viewport-1'),
        getState: jest.fn(() => ({
          activeViewportId: 'viewport-1',
          viewports: new Map([
            [
              'viewport-1',
              {
                viewportId: 'viewport-1',
                positionId: '0',
                displaySetInstanceUIDs: [displaySet.displaySetInstanceUID],
              },
            ],
          ]),
        })),
      },
    },
  };
}

describe('buildExportDocumentMeta', () => {
  it('prefers the active display set instance and formats patient-facing fields', () => {
    const displaySet = {
      displaySetInstanceUID: 'display-set-export-1',
      StudyInstanceUID: 'study-export-1',
      SeriesInstanceUID: 'series-export-1',
      SeriesDescription: '胸部薄层',
      Modality: 'CT',
      instances: [
        {
          SOPInstanceUID: 'instance-export-1',
          InstitutionName: '示例医院',
          PatientName: 'Alice^Example',
          PatientSex: 'F',
          PatientAge: '034Y',
          PatientID: 'P-001',
          AccessionNumber: 'ACC-001',
          StudyDate: '20260414',
          StudyDescription: 'CT Chest',
        },
      ],
    };

    DicomMetadataStore.addStudy({
      StudyInstanceUID: 'study-export-1',
      StudyDescription: 'Fallback Study',
      StudyDate: '20260101',
      PatientName: 'Fallback^Patient',
      PatientID: 'P-999',
      AccessionNumber: 'ACC-999',
    });

    const documentMeta = buildExportDocumentMeta(createServicesManager(displaySet));

    expect(documentMeta).toEqual({
      institutionName: '示例医院',
      patientName: 'Alice, Example',
      patientSex: 'F',
      patientAge: '034Y',
      patientId: 'P-001',
      accessionNumber: 'ACC-001',
      studyDate: '2026-04-14',
      studyDescription: 'CT Chest',
      modality: 'CT',
      seriesDescription: '胸部薄层',
    });
  });

  it('falls back to study metadata and leaves missing fields blank', () => {
    const displaySet = {
      displaySetInstanceUID: 'display-set-export-2',
      StudyInstanceUID: 'study-export-2',
      SeriesInstanceUID: 'series-export-2',
      displaySetLabel: '未增强序列',
      instances: [],
    };

    DicomMetadataStore.addStudy({
      StudyInstanceUID: 'study-export-2',
      StudyDescription: 'MRI Brain',
      StudyDate: '20260309',
      PatientName: 'Fallback^Only',
      PatientID: 'P-002',
      AccessionNumber: 'ACC-002',
      ModalitiesInStudy: ['MR'],
    });

    const documentMeta = buildExportDocumentMeta(createServicesManager(displaySet));

    expect(documentMeta).toEqual({
      institutionName: '',
      patientName: 'Fallback, Only',
      patientSex: '',
      patientAge: '',
      patientId: 'P-002',
      accessionNumber: 'ACC-002',
      studyDate: '2026-03-09',
      studyDescription: 'MRI Brain',
      modality: 'MR',
      seriesDescription: '未增强序列',
    });
  });
});
