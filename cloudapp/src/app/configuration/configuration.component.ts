import { Component, OnInit } from '@angular/core';
import { AppService } from '../app.service';
import { CloudAppConfigService, AlertService, FormGroupUtil } from '@exlibris/exl-cloudapp-angular-lib';
import { Settings } from '../models/configuration';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'app-configuration',
  templateUrl: './configuration.component.html',
  styleUrls: ['./configuration.component.scss']
})
export class ConfigurationComponent implements OnInit {
  form: FormGroup;
  saving = false;
  settings: Settings;

  constructor(
    private appService: AppService,
    private settingsService: CloudAppConfigService,
    private alert: AlertService,
  ) { }

  ngOnInit(): void {
    this.settingsService.get().subscribe(settings => {
      this.form = FormGroupUtil.toFormGroup(Object.assign(new Settings(), settings))
    });
  }

  save() {
    this.saving = true;
    this.settingsService.set(this.form.value).subscribe(
      response => {
        this.alert.success('Settings successfully saved.');
        this.form.markAsPristine();
      },
      err => this.alert.error(err.message),
      () => this.saving = false
    );
  }

}
