import * as Print from 'expo-print';
import { Alert } from 'react-native';

export interface LabelDeviceData {
  jobNumber: string;
  imei: string;
  modelName: string;
  faults: string[];
  customerName?: string;
  technicianName?: string;
  dateStr?: string;
  priority?: string;
}

export interface PrintOptions {
  labName?: string;
  labPhone?: string;
  paperWidth?: '58mm' | '80mm';
}

/**
 * Generates an SVG barcode for Code128 / Numbers
 */
function generateSimpleBarcodeSvg(text: string): string {
  // Simple CSS pattern barcode representation
  const clean = text.replace(/[^0-9A-Z]/gi, '');
  return `
    <div style="margin: 6px 0; display: flex; flex-direction: column; align-items: center;">
      <div style="font-family: 'Libre Barcode 128', 'Courier New', monospace; font-size: 32px; letter-spacing: 2px; font-weight: 900; line-height: 1;">
        ||| | |||| || ||| || |||| | ||| ||
      </div>
      <div style="font-size: 11px; font-family: monospace; font-weight: bold; letter-spacing: 1px; margin-top: 2px;">
        ${clean}
      </div>
    </div>
  `;
}

/**
 * Builds HTML for 58mm / 80mm Thermal Label Sticker
 */
export function buildLabelHtml(device: LabelDeviceData, options: PrintOptions = {}): string {
  const labName = options.labName || 'iLab Mobile Service';
  const labPhone = options.labPhone || '';
  const is80mm = options.paperWidth === '80mm';
  const widthMm = is80mm ? '76mm' : '54mm';
  const dateStr = device.dateStr || new Date().toLocaleDateString('en-GB');

  const faultListStr = device.faults && device.faults.length > 0
    ? device.faults.join(', ')
    : 'General Diagnostic / Inspection';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Label - ${device.jobNumber}</title>
        <style>
          @page {
            size: ${widthMm} auto;
            margin: 0;
          }
          body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            margin: 0;
            padding: 8px 6px;
            width: ${widthMm};
            box-sizing: border-box;
            background: #ffffff;
            color: #000000;
          }
          .label-box {
            border: 2px solid #000;
            border-radius: 4px;
            padding: 6px 4px;
            page-break-after: always;
          }
          .lab-header {
            text-align: center;
            border-bottom: 1.5px solid #000;
            padding-bottom: 4px;
            margin-bottom: 4px;
          }
          .lab-title {
            font-size: 13px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .lab-contact {
            font-size: 9px;
            font-weight: 600;
          }
          .model-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin: 4px 0;
          }
          .model-title {
            font-size: 14px;
            font-weight: 900;
            text-transform: uppercase;
          }
          .priority-tag {
            font-size: 9px;
            font-weight: 900;
            padding: 2px 4px;
            border: 1px solid #000;
            border-radius: 2px;
          }
          .fault-box {
            background: #f0f0f0;
            border: 1px dashed #000;
            padding: 4px;
            margin: 4px 0;
            font-size: 10px;
            font-weight: 700;
            line-height: 1.2;
          }
          .info-table {
            width: 100%;
            font-size: 9px;
            border-collapse: collapse;
            margin-top: 4px;
          }
          .info-table td {
            padding: 2px 0;
            vertical-align: top;
          }
          .info-table .key {
            font-weight: bold;
            width: 48px;
          }
          .footer-note {
            text-align: center;
            font-size: 8px;
            font-weight: bold;
            margin-top: 6px;
            border-top: 1px solid #000;
            padding-top: 2px;
          }
        </style>
      </head>
      <body>
        <div class="label-box">
          <div class="lab-header">
            <div class="lab-title">${labName}</div>
            ${labPhone ? `<div class="lab-contact">${labPhone}</div>` : ''}
          </div>

          <div class="model-row">
            <span class="model-title">${device.modelName}</span>
            ${device.priority === 'URGENT' ? '<span class="priority-tag">URGENT</span>' : ''}
          </div>

          ${generateSimpleBarcodeSvg(device.imei)}

          <div class="fault-box">
            <div>⚡ FAULT:</div>
            <div>${faultListStr}</div>
          </div>

          <table class="info-table">
            <tr>
              <td class="key">JOB #:</td>
              <td><strong>${device.jobNumber}</strong></td>
            </tr>
            <tr>
              <td class="key">DATE:</td>
              <td>${dateStr}</td>
            </tr>
            ${device.customerName ? `
            <tr>
              <td class="key">PARTY:</td>
              <td>${device.customerName}</td>
            </tr>` : ''}
            ${device.technicianName ? `
            <tr>
              <td class="key">TECH:</td>
              <td>${device.technicianName}</td>
            </tr>` : ''}
          </table>

          <div class="footer-note">
            KEEP THIS STICKER ON DEVICE FOR WARRANTY
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Builds HTML for Multi-Device Lot / Batch Printing
 */
export function buildBatchLotHtml(devices: LabelDeviceData[], options: PrintOptions = {}): string {
  const labName = options.labName || 'iLab Mobile Service';
  const labPhone = options.labPhone || '';
  const is80mm = options.paperWidth === '80mm';
  const widthMm = is80mm ? '76mm' : '54mm';
  const dateStr = new Date().toLocaleDateString('en-GB');

  const labelCards = devices.map((device) => {
    const faultListStr = device.faults && device.faults.length > 0
      ? device.faults.join(', ')
      : 'General Diagnostics';

    return `
      <div class="label-box">
        <div class="lab-header">
          <div class="lab-title">${labName}</div>
          ${labPhone ? `<div class="lab-contact">${labPhone}</div>` : ''}
        </div>

        <div class="model-row">
          <span class="model-title">${device.modelName}</span>
          ${device.priority === 'URGENT' ? '<span class="priority-tag">URGENT</span>' : ''}
        </div>

        ${generateSimpleBarcodeSvg(device.imei)}

        <div class="fault-box">
          <div>⚡ FAULT:</div>
          <div>${faultListStr}</div>
        </div>

        <table class="info-table">
          <tr>
            <td class="key">JOB #:</td>
            <td><strong>${device.jobNumber}</strong></td>
          </tr>
          <tr>
            <td class="key">DATE:</td>
            <td>${device.dateStr || dateStr}</td>
          </tr>
          ${device.customerName ? `
          <tr>
            <td class="key">PARTY:</td>
            <td>${device.customerName}</td>
          </tr>` : ''}
        </table>
      </div>
    `;
  }).join('\n');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Batch Labels (${devices.length} Devices)</title>
        <style>
          @page {
            size: ${widthMm} auto;
            margin: 0;
          }
          body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            margin: 0;
            padding: 4px;
            width: ${widthMm};
            box-sizing: border-box;
            background: #ffffff;
            color: #000000;
          }
          .label-box {
            border: 2px solid #000;
            border-radius: 4px;
            padding: 6px 4px;
            margin-bottom: 8px;
            page-break-after: always;
          }
          .lab-header {
            text-align: center;
            border-bottom: 1.5px solid #000;
            padding-bottom: 3px;
            margin-bottom: 3px;
          }
          .lab-title {
            font-size: 13px;
            font-weight: 900;
            text-transform: uppercase;
          }
          .lab-contact {
            font-size: 9px;
            font-weight: 600;
          }
          .model-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin: 2px 0;
          }
          .model-title {
            font-size: 13px;
            font-weight: 900;
            text-transform: uppercase;
          }
          .priority-tag {
            font-size: 9px;
            font-weight: 900;
            padding: 1px 3px;
            border: 1px solid #000;
          }
          .fault-box {
            background: #f0f0f0;
            border: 1px dashed #000;
            padding: 3px;
            margin: 3px 0;
            font-size: 9px;
            font-weight: 700;
          }
          .info-table {
            width: 100%;
            font-size: 9px;
            border-collapse: collapse;
          }
          .info-table td {
            padding: 1px 0;
          }
          .info-table .key {
            font-weight: bold;
            width: 48px;
          }
        </style>
      </head>
      <body>
        ${labelCards}
      </body>
    </html>
  `;
}

/**
 * Triggers Thermal Print Job on Android / iOS
 */
export async function printSingleDeviceLabel(device: LabelDeviceData, options: PrintOptions = {}): Promise<void> {
  try {
    const html = buildLabelHtml(device, options);
    await Print.printAsync({ html });
  } catch (err: any) {
    Alert.alert('Print Error', err.message || 'Could not print label');
  }
}

/**
 * Triggers Thermal Print for Entire Lot of Devices
 */
export async function printLotLabels(devices: LabelDeviceData[], options: PrintOptions = {}): Promise<void> {
  if (!devices || devices.length === 0) {
    Alert.alert('Empty Lot', 'No devices selected for printing.');
    return;
  }
  try {
    const html = buildBatchLotHtml(devices, options);
    await Print.printAsync({ html });
  } catch (err: any) {
    Alert.alert('Print Error', err.message || 'Could not print lot labels');
  }
}
