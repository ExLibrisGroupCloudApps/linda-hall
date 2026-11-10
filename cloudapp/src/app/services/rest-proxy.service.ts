import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { forkJoin, Observable, of, throwError } from 'rxjs';
import { CloudAppEventsService, HttpMethod, Request } from '@exlibris/exl-cloudapp-angular-lib';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { merge } from 'lodash';

@Injectable({
  providedIn: 'root'
})
export class RestProxyService {
  private _token: string;
  instCode: string;

  public constructor(
    private http: HttpClient,
    private eventsService: CloudAppEventsService,
  ) { }

  call<String>(request: string | Request, params: URLSearchParams) {
    let req: Request = typeof request == 'string' ? { url: request, method: HttpMethod.GET } : request;
    req = merge({ method: HttpMethod.GET, headers: {}, params: {} }, req);

    return forkJoin([
      this.getToken()
    ])
      .pipe(
        switchMap(results => {
          const [token] = results;
          const url = 'https://api-ap.exldevnetwork.net/proxy' + req.url;
          const headers = new HttpHeaders({
            'accept': 'application/json',
            'authorization': `Bearer ${token}`,
            'X-Proxy-Host': 'https://lindahall.alma.exlibrisgroup.com/',
          });

          switch (req.method) {
            case HttpMethod.GET:
              return this.http.get(url, { headers, responseType: 'text' });

            case HttpMethod.POST:
              return this.http.post(`${url}?${params.toString()}`, null, { headers: headers, responseType: 'text' });

          }
        })
      )
  }

  private getToken() {
    if (this._token) return of(this._token);
    return this.eventsService.getAuthToken()
      .pipe(tap(token => this._token = token));
  }
}

const wrapError = (obs: Observable<any>): Observable<any> => {
  return obs.pipe(
    catchError(err => {
      if (err.error && err.error.errorList) {
        err.message = err.error.errorList.error[0].errorMessage
      };
      return throwError(err);
    })
  )
}