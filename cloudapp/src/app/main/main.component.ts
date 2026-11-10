import { Observable, forkJoin, Subscription, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import {
  CloudAppRestService, CloudAppEventsService, Request, HttpMethod,
  Entity, PageInfo, CloudAppConfigService
} from '@exlibris/exl-cloudapp-angular-lib';
import { MatSelectionListChange, MatSelectionList, MatListOption } from '@angular/material/list';
import { AvailabilityResponse, PlaceOrderResponse } from '../models/response';
import { Settings } from '../models/configuration';
import { RestProxyService } from '../services/rest-proxy.service';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss']
})
export class MainComponent implements OnInit, OnDestroy {
  @ViewChild('requests') requests: MatSelectionList;
  private pageLoad$: Subscription;
  loading = true;
  ready = false;
  placeOrderEnded = false;
  settings: Settings;
  hasSettings = false;
  selectedEntity: Entity;
  apiResult: any;
  pageEntities: Entity[];
  selectedEntities: Entity[];
  requestIdToRequest = new Map();
  requestToAvailable: Map<string, AvailabilityResponse> = new Map<string, AvailabilityResponse>();
  requestToPartner: Map<string, PlaceOrderResponse> = new Map<string, PlaceOrderResponse>();
  // Level of service dropdown disabled for now; kept for future use
  // requestToLevelOfService: Map<string, string> = new Map<string, string>();
  // levelOfServiceOptions = ['Regular', 'Rush (3 hours)', 'Urgent (1 hour)'];
  // levelOfServiceCodes: { [key: string]: string } = {
  //   'Regular': 'NORMAL_FULL',
  //   'Rush (3 hours)': 'RUSH_LOCAL',
  //   'Urgent (1 hour)': 'URGENT'
  // };
  orderResponse;
  optionsSelected = [];

  entities$: Observable<Entity[]> = this.eventsService.entities$;
  showButton: boolean = false;

  constructor(
    private restService: CloudAppRestService,
    private eventsService: CloudAppEventsService,
    private configService: CloudAppConfigService,
    private rest: RestProxyService,
  ) { }

  ngOnInit() {
    this.pageLoad$ = this.eventsService.onPageLoad(this.onPageLoad);
    this.configService.get().subscribe(config => {
      this.settings = config as Settings;
      if (this.settings.partnerCode) {
        this.hasSettings = true;
      }
    });
  }

  ngOnDestroy(): void {
  }

  onPageLoad = (pageInfo: PageInfo) => {
    this.pageEntities = pageInfo.entities;
    if ((this.pageEntities || []).length > 0 && this.pageEntities[0].type === 'BORROWING_REQUEST') {
      this.requestIdToRequest.clear();
      this.requestToAvailable.clear();
      this.requestToPartner.clear();
      this.loadEntities();
    }
    else 
     this.loading = false;
  }

  loadEntities() {
    let calls = [];

    this.pageEntities.forEach(entity => calls.push(this.restService.call(entity.link).pipe(
      map((res) => {
        this.requestIdToRequest.set(res.request_id, res);
        let url = "/view/sru/01LINDAHALL_INST/?version=1.2&operation=searchRetrieve&recordSchema=marcxml&query=";
        if (res.format && res.format.value && res.format.value == "PHYSICAL") {
          this.checkIsAvailable(res.request_id, null, "Physical materials cannot be requested");
        } else if ((res.issn || res.isbn || res.oclc_number) && (res.title)) {
          if (res.isbn) {
            url += "alma.isbn=" + res.isbn;
          }
          else if (res.issn) {
            url += "alma.issn=" + res.issn;
          }
          else if (res.oclc_number) {
            url += "alma.other_system_number_035_az=" + res.oclc_number;
          }
          if (res.title) {
            res.title = res.title.trimStart();
            res.title = res.title.replace(/ .*/, "");;
            url += "%20and%20alma.title=" + res.title + "%20and%20alma.mms_tagSuppressed=false";

            return this.rest.call<any>(url, null).subscribe({
              next: response => {
                let diag = new DOMParser().parseFromString(response, "text/xml").getElementsByTagName("diagnostics")[0];
                if (diag) {
                  let message = new DOMParser().parseFromString(response, "text/xml").getElementsByTagName("diag:message")[0].childNodes[0].nodeValue;
                  this.checkIsAvailable(res.request_id, null, message);

                }
                else
                  this.checkIsAvailable(res.request_id, response, null);

              }, error: error => {
                console.log(error);
                this.checkIsAvailable(res.request_id, null, error);
              }
            });

          }

        }
        else {
          this.checkIsAvailable(res.request_id, null, "Missing ISBN, ISBN, or OCLC # and Title");
        }
      }),
      catchError(e => of(e))
    )));
    
    forkJoin(calls).subscribe({
      complete: () => {

      },
      error: error => {
        console.log(error);

      }
    });

  }

  checkIsAvailable(requestId, response, error) {
    let Object = new AvailabilityResponse();
    Object.requestId = requestId;
    if (error) {
      Object.errorMsg = error;
      Object.availablity = "0";
    }
    if (response) {
      let responseAvail = new DOMParser().parseFromString(response, "text/xml").getElementsByTagName("numberOfRecords")[0].childNodes[0].nodeValue;
      if (responseAvail > "0") {
        Object.availablity = responseAvail;
      }
      else {
        Object.availablity = "0";
      }
    }
    Object.ready = true;
    this.requestToAvailable.set(requestId, Object);
    this.loading = false;
  }

  getEntityPrice(requestId) {
    let priceObject = this.requestToAvailable.get(requestId);
    if (priceObject && priceObject.price) {
      let basePrice = priceObject.price;
      if (basePrice.length == 4) {
        basePrice = basePrice + '0';
      }
      // Level of service fee disabled for now since level of service is hardcoded to Regular
      //let total = parseFloat(basePrice) + this.getLevelOfServiceFee(requestId);
      let total = parseFloat(basePrice);
      return total.toFixed(2);
    }
    return "-1";
  }

  // Level of service dropdown disabled for now; kept for future use
  // getLevelOfServiceFee(requestId) {
  //   switch (this.getLevelOfService(requestId)) {
  //     case 'Rush (3 hours)':
  //       return 20;
  //     case 'Urgent (1 hour)':
  //       return 100;
  //     default:
  //       return 0;
  //   }
  // }

  isPriceLoaded(requestId) {
    let priceObject = this.requestToAvailable.get(requestId);
    return priceObject && priceObject.availablity;
  }

  getPriceErrorMsg(requestId) {
    let priceObject = this.requestToAvailable.get(requestId);
    if (priceObject && priceObject.errorMsg) {
      return priceObject.errorMsg;
    }
    return "";
  }

  getEntityAuthor(requestId) {
    let requestObject = this.requestIdToRequest.get(requestId);
    if (requestObject && requestObject.author) {
      return requestObject.author;
    }
    return "";
  }

  getEntityJournalTitle(requestId) {
    let requestObject = this.requestIdToRequest.get(requestId);
    if (requestObject && requestObject.journal_title) {
      return requestObject.journal_title;
    }
    return "";
  }

  getEntityPublication(requestId) {
    let requestObject = this.requestIdToRequest.get(requestId);
    if (requestObject && requestObject.year) {
      return requestObject.year;
    }
    return "";
  }

  getEntityPages(requestId) {
    let requestObject = this.requestIdToRequest.get(requestId);
    if (requestObject && requestObject.pages) {
      return requestObject.pages;
    }
    return "";
  }

  // Level of service dropdown disabled for now; kept for future use
  // getLevelOfService(requestId) {
  //   return this.requestToLevelOfService.get(requestId) || this.levelOfServiceOptions[0];
  // }

  // onLevelOfServiceChanged(requestId, value) {
  //   this.requestToLevelOfService.set(requestId, value);
  // }

  onSelectAllClicked() {
    this.requests.options.forEach(request => {
      let requestId = request.value.id;
      if (!this.loading && !this.isPhysical(requestId) && (this.isAvail(requestId) && this.isMissingData(requestId) != true) && (this.getEntityOrderStatus(requestId) != 'failed') && (this.getOrderStatus(requestId) != 'done')) {
        request.selected = true;
      }
    });
  }

  onSelectedChanged($event: MatSelectionListChange) {
    let requestId = $event.option.value.id;
    if (!this.loading && ((this.isPhysical(requestId) == false) && (this.isAvail(requestId) == false) && (this.isMissingData(requestId) == false)) || (this.getPriceErrorMsg(requestId) != "") || (this.getEntityOrderStatus(requestId) == 'failed') || (this.getOrderStatus(requestId) == 'done')) {
      event.preventDefault();
      event.stopPropagation();
      $event.option.selected = false;
      return;
    }
  }

  isAvail(requestId) {
    let requestObject = this.requestToAvailable.get(requestId);
    if (requestObject && requestObject.availablity > "0")
      return true;
    else
      return false;
  }

  isMissingData(requestId) {
    let requestObject = this.requestToAvailable.get(requestId);
    if (requestObject && requestObject.errorMsg == "Missing ISBN, ISBN, or OCLC # and Title")
      return true;
    else
      return false;
  }

  isPhysical(requestId) {
    let requestObject = this.requestIdToRequest.get(requestId);
    if(requestObject && requestObject.format.value && requestObject.format.value == "PHYSICAL") {
      return true;
    }
    return false;
  }

  onPlaceOrderClicked(event, requestId) {
    event.preventDefault();
    event.stopPropagation();
    this.placeOrderEnded = false;
    let orderObject = new PlaceOrderResponse();
    orderObject.status = "loading";
    this.requestToPartner.set(requestId, orderObject);
    let requestObject = this.requestIdToRequest.get(requestId);
    if (requestObject.title && (requestObject.issn || requestObject.isbn || requestObject.oclc_number) && this.settings.partnerCode) {
      this.updatePartner(requestObject, this.settings.partnerCode);
    } else {
      this.setOrderErrorMsg(requestId, "missing parameters");
    }
  }

  updatePartner(requestId, partnerCode) {
    let priceObject = this.requestToAvailable.get(requestId.request_id);
    // Level of service hardcoded to NORMAL_FULL for now; dropdown disabled (see above)
    // let levelOfServiceCode = this.levelOfServiceCodes[this.getLevelOfService(requestId.request_id)];
    let levelOfServiceCode = "NORMAL_FULL";
    let updateUrl = "/rapido/v1/user/" + requestId.requester.value + "/resource-sharing-requests/" + requestId.request_id + "?op=assign_request_to_partner&partner=" + partnerCode + "&levelOfService=" + levelOfServiceCode;
    if (priceObject && priceObject.price) {
      updateUrl += "&cost=" + this.getEntityPrice(requestId.request_id);
    }
    let request: Request = {
      url: updateUrl,
      method: HttpMethod.POST
    };
    this.restService.call(request).subscribe({
      next: data => {
        let a = data;
        this.placeOrderEnded = true
        priceObject.status = "done";
      },
      error: error => {
        console.log(error);
        this.setOrderErrorMsg(requestId, error);
        this.placeOrderEnded = true;
        priceObject.status = "failed";
      },
      complete: () => this.placeOrderEnded = true
    });
  }

  setOrderErrorMsg(requestId, error) {
    let orderObject = this.requestToPartner.get(requestId.request_id);
    if (orderObject) {
      orderObject.status = "failed";
      orderObject.errorMsg = error.message;
    } else {
      let orderObject = new PlaceOrderResponse();
      orderObject.status = "failed";
      orderObject.errorMsg = error;
      this.requestToPartner.set(requestId, orderObject);
    }
  }

  getOrderStatus(requestId) {
    let orderObject = this.requestToAvailable.get(requestId);
    if (orderObject && orderObject.status) {
      return orderObject.status;
    }
    return "";
  }

  getEntityOrderStatus(requestId) {
    let orderObject = this.requestToPartner.get(requestId);
    if (orderObject && orderObject.status) {
      return orderObject.status;
    }
    return "";
  }

  getEntityReadyStatus(requestId) {
    let orderObject = this.requestToAvailable.get(requestId);
    if (orderObject && orderObject.ready) {
      return orderObject.ready;
    }
    return "";
  }

  getOrderErrorMsg(requestId) {
    let priceObject = this.requestToAvailable.get(requestId);
    if (priceObject && priceObject.errorMsg) {
      return priceObject.errorMsg;
    }
    let orderObject = this.requestToPartner.get(requestId);
    if (orderObject && orderObject.errorMsg) {
      return orderObject.errorMsg;
    }
    return "";
  }

  onBulkPlaceOrderClicked(event, selectedOptions: MatListOption[]) {
    this.placeOrderEnded = false;
    let selectedRequests = selectedOptions.map(o => o.value);

    selectedRequests.forEach(entity =>
      this.onPlaceOrderClicked(event, entity.id));
    this.deselectAll();
  }

  deselectAll(): void {
    this.optionsSelected = [];
  }

}
