// CAP-030 / TER-1513 — interfaces matching live pickQueue / pickListWithLines API shapes

export interface PickQueueItem {
  id: string;
  pickNo: string;
  orderId: string;
  customer: string;
  status: 'needs_picking' | 'in_progress' | 'has_alerts' | 'ready_to_close' | 'closed';
  alertCount: number;
  lineCount: number;
  linesPicked: number;
  oldestReleasedAt?: string; // for sorting
}

export interface PickLine {
  id: string;
  pickListId: string;
  orderId: string;
  itemName: string;
  batchCode: string;
  expectedQty: number;
  actualQty?: number;
  actualWeight?: number;
  bagCode?: string;
  status: 'pending' | 'picking' | 'packed' | 'hold' | 'cancelled';
  alertCount: number;
}

export interface PickListWithLines {
  pickListId: string;
  pickNo: string;
  customer: string;
  lines: PickLine[];
}

export interface WarehouseAlertInterrupt {
  id: string;
  lineId: string;
  message: string;
  type: string;
}
