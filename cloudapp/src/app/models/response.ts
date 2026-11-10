export class AvailabilityResponse {
    requestId: string = "";
    availablity: string = "";
    errorMsg: string = "";
    status: string = "";
    price: string = "15.00";
    ready: boolean = false;
  }

  export class PlaceOrderResponse {
    requestId: string = "";
    status: string = "";
    errorMsg: string = "";
    additionalId: string = "";
  }