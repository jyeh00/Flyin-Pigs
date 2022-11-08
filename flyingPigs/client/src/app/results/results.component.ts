import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import {filter, first, flatMap, map, Observable, Subject, Subscription, take, tap} from 'rxjs';
import { Options } from 'ngx-google-places-autocomplete/objects/options/options';
import { ResultsService} from "../results/results.service";
import { SearchSchema, DropdownOption } from '../searchSchema';
import { Router } from '@angular/router';
import { DataService } from "../data.service";
import { ResultInfoSchema, TripSchema } from '../flightSchema';
import {NGXLogger} from "ngx-logger";
import { MenuItem } from 'primeng/api';
import { faCar, faBus, faPlane, faPersonBiking, faPersonWalking, faDollarSign, faClock, faUser } from '@fortawesome/free-solid-svg-icons';
import {FaIconLibrary} from '@fortawesome/angular-fontawesome';
import { Time } from '@angular/common';

@Component({
  selector: 'results',
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss']
})

export class ResultsComponent implements OnInit, OnDestroy {
  // SEARCH INPUT VARS
  classes: DropdownOption[];  // Flight class options
  selectedClass: DropdownOption = {name: 'Economy', code: 'ECONOMY'}; // Selected flight class
  dTransportType: DropdownOption[]; // Transportation to airport options
  aTransportType: DropdownOption[]; // Transportation from airport options
  selectedDTransport: DropdownOption = {name: 'Car', code: 'driving', icon: 'car'}; // Transportation option
  selectedATransport: DropdownOption = {name: 'Car', code: 'driving', icon: 'car'}; // Transportation option
  isRoundTrip: boolean = false; // Round Trip toggle
  hours: DropdownOption[]; // hours for transportation before/after flight

  adultPass: number = 1;  // number of adult passengers
  childPass: number = 0;  // number of child passengers
  infantPass: number = 0; // number of infant passengers

  maxTimeStart: DropdownOption = {name: '3 hr', sec: 10800}; //default starting driving hours
  maxTimeEnd: DropdownOption = {name: '1 hr', sec: 3600}; //default end driving hours

  totalPass: number = this.adultPass + this.childPass + this.infantPass;  // total number of passengers
  subscription!: Subscription;  // subscription to send search from search to results
  date: any;  // current date
  maxDate: any; // max selectable date
  departDate: string; // selected departure date
  returnDate: string; // selected return date (in the case of round trip)

  departAdd= "";  // departure address input
  arriveAdd= "";  // arrival address input

  //icons
  driving = faCar;
  transit = faBus;

  // FILTER VARS
  totalPrice: number[] = [];
  stops: any[];
  selectedStop: any = null;
  filterAirlines: any[];
  selectedAirlines: any[];
  filterDepartAirports: any[];
  selectedDepartAirports: any[];
  filterArrivalAirports: string[];
  selectedArrivalAirports: any[];
  maxTravelTime: number = 24;
  maxFlightTime: number = 10;
  departTime: Time;
  arrivalTime: Time;
  minPrice: number;
  maxPrice: number;

  airports: any[];
  airlineTags: string[] = ['AA', 'AS', 'B6', 'DL', 'F9', 'HA', 'NK', 'UA', 'WN'];
   
  constructor(private resultsService: ResultsService, private data: DataService, private logger: NGXLogger, library: FaIconLibrary) {
    this.classes = [
      {name: 'Economy', code: 'ECONOMY'},
      {name: 'Premium Economy', code: 'PREMIUM_ECONOMY'},
      {name: 'Business', code: 'BUSINESS'},
      {name: 'First', code: 'FIRST'}
    ];
    this.dTransportType = [
      {name: 'Car', code: 'driving', icon: 'car'},
      {name: 'Public Transit', code: 'transit', icon:'bus'},
      // {name: 'Bike', code: 'Biking'},
      // {name: 'Walk', code: 'Walking'}
    ];
    this.aTransportType = [
      {name: 'Car', code: 'driving', icon: 'car'},
      {name: 'Public Transit', code: 'transit', icon:'bus'},
      // {name: 'Bike', code: 'Biking'},
      // {name: 'Walk', code: 'Walking'}
    ];
    this.hours = [
      {name: '1 hr', sec: 3600},
      {name: '2 hr', sec: 7200},
      {name: '3 hr', sec: 10800},
      {name: '4 hr', sec: 14400},
      {name: '5 hr', sec: 18000},
      {name: '6 hr', sec: 21600},
      {name: '7 hr', sec: 25200}
    ];
    this.stops = [
      {name: 'Any number of stops', key: 'all'},
      {name: 'Nonstop only', key: 'none'},
      {name: '1 stop or fewer', key: 'one'},
      {name: '2 stops or fewer', key: 'two'}
    ];

    library.addIcons(
      faCar,
      faBus
    );

    this.selectedStop = this.stops[0];
  }

  // COPY START

  // Google autocomplete stuff
  options:Options = new Options({
    componentRestrictions:{
      country:"US"}
  });
  AddressChange1(address: any) {
    this.departAdd = address.formatted_address;
  }
  AddressChange2(address: any) {
    this.arriveAdd = address.formatted_address;
  }

  // update total passengers display when passenger overlay is exited
  updatePassengers() {
    this.totalPass = this.adultPass + this.childPass + this.infantPass;
  }

  // ensure return date is cleared if one way is selected
  handleOneWay(e) {
    if(e.checked) {
      this.returnDate = ""
    }
  }

  // reset input boxes to valid, clear inputs, set back to default, and set search object back to default
  handleClear() {
    sessionStorage.removeItem('searchParams');
    this.resetValidity();
    this.selectedClass = {name: 'Economy', code: 'ECONOMY'};
    this.selectedDTransport = {name: 'Car', code: 'driving', icon: 'car'};
    this.selectedATransport = {name: 'Car', code: 'driving', icon: 'car'};
    this.isRoundTrip = false;
    this.adultPass = 1;
    this.childPass = 0;
    this.infantPass = 0;
    this.departDate = "";
    this.returnDate = "";
    this.totalPass = this.adultPass + this.childPass + this.infantPass;
    this.departAdd = "";
    this.arriveAdd = "";
    this.maxTimeStart = {name: '3 hr', sec: 10800};
    this.maxTimeEnd = {name: '1 hr', sec: 3600};
  }

  search: SearchSchema = {
    selectedClass: {name: 'Economy', code: 'ECONOMY'},
    isRoundTrip: false,
    adultPass: 1,
    childPass: 0,
    infantPass: 0,
    totalPass: 1,
    departDate: "",
    returnDate: "",
    departAdd: "",
    departCoord: new google.maps.LatLng({"lat": 0, "lng": 0}),
    arriveAdd: "",
    arriveCoord: new google.maps.LatLng({"lat": 0, "lng": 0}),
    selectedDTransport: {name: 'Car', code: 'driving', icon: 'car'},
    selectedATransport: {name: 'Car', code: 'driving', icon: 'car'},
    maxTimeStart: {name: '3 hr', sec: 10800},
    maxTimeEnd: {name: '1 hr', sec: 3600}
  }

  // input validation, geocoding, search sent to results, and navigate to results
  async handleSearch() {
    this.resetValidity();
    // let departureCoord = await this.geocode(this.departAdd);
    // let arrivalCoord = await this.geocode(this.arriveAdd);
    let departureCoord;
    let arrivalCoord
    let prevSearch = JSON.parse(sessionStorage.getItem('searchParams') || "");
    if(!prevSearch || prevSearch.departAdd != this.departAdd){
      departureCoord = await this.geocode(this.departAdd);
    }
    else {
      departureCoord = prevSearch.departCoord;
    }
    if(!prevSearch || prevSearch.arriveAdd != this.arriveAdd){
      arrivalCoord = await this.geocode(this.arriveAdd);
    }
    else {
      arrivalCoord = prevSearch.arriveCoord;
    }

    let route = true;
    // input validation
    if(!this.departDate) {
      const x = document.getElementById('departDate');
      x?.classList.add('ng-invalid')
      x?.classList.add('ng-dirty')
      route = false
    } else {
      const x = document.getElementById('departDate');
      var departDateObj = new Date(this.departDate);
      if(departDateObj < new Date(this.date) || departDateObj > new Date(this.maxDate) || x?.classList.contains('ng-invalid')) {
        x?.classList.add('ng-invalid')
        x?.classList.add('ng-dirty')
        route = false
      }
    }
    if(!this.returnDate) {
      if(this.isRoundTrip) {
        const x = document.getElementById('returnDate');
        x?.classList.add('ng-invalid')
        x?.classList.add('ng-dirty')
        route = false
      }
    } else {
      const x = document.getElementById('returnDate');
      var returnDateObj = new Date(this.returnDate);
      if(returnDateObj < new Date(this.departDate) || returnDateObj > new Date(this.maxDate) || x?.classList.contains('ng-invalid')) {
        x?.classList.add('ng-invalid')
        x?.classList.add('ng-dirty')
        route = false
      }
    }
    if(!this.departAdd || departureCoord == null) {
      // departure address is invalid probably
      // should not advance
      const x = document.getElementById('daddress');
      x?.classList.add('ng-invalid')
      x?.classList.add('ng-dirty')
      route = false
    }
    if(!this.arriveAdd || arrivalCoord == null) {
      // arrival address is invalid probably
      // should not advance
      const x = document.getElementById('aaddress');
      x?.classList.add('ng-invalid')
      x?.classList.add('ng-dirty')
      route = false
    }

    // if valid, create search object and route to results
    // else, alert
    if(route) {
      this.search = {
        selectedClass: this.selectedClass,
        isRoundTrip: this.isRoundTrip,
        adultPass: this.adultPass,
        childPass: this.childPass,
        infantPass: this.infantPass,
        totalPass: this.totalPass,
        departDate: this.departDate,
        returnDate: this.returnDate,
        departAdd: this.departAdd,
        departCoord: departureCoord,
        arriveAdd: this.arriveAdd,
        arriveCoord: arrivalCoord,
        selectedDTransport: this.selectedDTransport,
        selectedATransport: this.selectedATransport,
        maxTimeStart: this.maxTimeStart,
        maxTimeEnd: this.maxTimeEnd
      }
      sessionStorage.setItem('searchParams', JSON.stringify(this.search));
      this.data.changeMessage(this.search)
    } else {
      alert("Error: Some fields are invalid or empty. Please fix them and try again.")
    }
  }
  
  resetValidity() {
    // reset validity of all input boxes
    const elements: Element[] = Array.from(document.getElementsByTagName("input"));
    elements.forEach((el: Element) => {
      el.classList.remove('ng-invalid')
      el.classList.remove('ng-dirty')
      el.classList.add('ng-pristine')
    })
  }

  /*
  Geocodes an address.
  Returns LatLng object with lat() and lng() getter functions
  If an error occurs, returns a null. 
  */
  async geocode(address) {
    console.log("GEOCODING");
    var coord;
    var geocoder = new google.maps.Geocoder();
    await geocoder.geocode({ 'address': address}).then(response => {
      coord = response.results[0].geometry.location;
    }).catch(e => {
      coord = null;
    });
    return coord;
  }
  // COPY END
  // DIFFERENT FROM SEARCH
  results$: Observable<ResultInfoSchema> = new Observable();  // original results returned from backend
  trips:TripSchema[]; // original results returned from backend but not async:)
  filteredTrips:TripSchema[]; // filtered results
  displayTrips:TripSchema[];  // results that are displayed on frontend (splice of filteredTrips)
  loaded: number = 10;  // number of results to show
  shouldLoad:boolean = false; // if it is possible to load more
  ngOnInit(): void {
    // grab search info from search page and assign to input vars
    this.subscription = this.data.currentMessage.subscribe(search => this.search = search)

    this.search = JSON.parse(sessionStorage.getItem('searchParams') || "");
    this.selectedClass = this.search.selectedClass;
    this.isRoundTrip = this.search.isRoundTrip;
    this.adultPass = this.search.adultPass;
    this.childPass = this.search.childPass;
    this.infantPass = this.search.infantPass;
    this.totalPass = this.search.totalPass;
    this.departDate = this.search.departDate;
    this.returnDate = this.search.returnDate;
    this.departAdd = this.search.departAdd;
    this.arriveAdd = this.search.arriveAdd;
    this.selectedDTransport = this.search.selectedDTransport;
    this.selectedATransport = this.search.selectedATransport;
    this.maxTimeStart = this.search.maxTimeStart;
    this.maxTimeEnd = this.search.maxTimeEnd;

    // get trip results
    this.results$ = this.resultsService.searchAirports(this.search);
    this.results$.subscribe(value => {
      this.trips = value.trips;
      this.filteredTrips = value.trips;
      this.displayTrips = value.trips.slice(0,this.loaded);
      if(this.filteredTrips.length > this.loaded) {
        this.shouldLoad = true;
      }
      this.filterDepartAirports = value.depAirlines; //need to change names later
      this.filterArrivalAirports = value.arrAirlines; //need to change names later
      this.selectedArrivalAirports = this.filterArrivalAirports;
      this.selectedDepartAirports = this.filterDepartAirports;
      this.filterAirlines = value.airlines;
      this.maxPrice = value.maxPrice || 0;
      this.minPrice = value.minPrice || 0;
      this.totalPrice = [this.minPrice, this.maxPrice];
      this.selectedAirlines = this.filterAirlines;
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  loadMore() {
    this.loaded += 10
    this.displayTrips = this.filteredTrips.slice(0,this.loaded);
    if(this.filteredTrips.length > this.loaded) {
      this.shouldLoad = true;
    } else {
      this.shouldLoad = false;
    }
  }

  filterResults() {
    let newTripArr:TripSchema[] = [];
    let chosenStops:number;
    this.logger.info("Filtering data...");
    //converted selected stops into a number
    switch(this.selectedStop.key) {
      case("none"): chosenStops = 0;
      break;
      case("all"): chosenStops = Number.MAX_SAFE_INTEGER;
      break;
      case("one"): chosenStops = 1;
      break;
      case("two"): chosenStops = 2;
      break;
    }

    this.trips.forEach(trip => {
      //get total trip time
      let totalTripTime:number = trip.totalDepTime
      if (trip.totalRetTime) {
        totalTripTime += trip.totalRetTime;
      }
      //get total flight time
      let totalFlightTime:number = trip.departingFlight.flightTime;
      if (trip.returningFlight) {
        totalFlightTime += trip.returningFlight.flightTime;
      }

      //convert string to Time to object
      let departTimeStrings = trip.departingFlight.departureTime.split("T").slice(-1)[0].split(":");
      let departTimeString = departTimeStrings[0] + ":" +  departTimeStrings[1];
      let arriveTimeStrings = trip.departingFlight.arrivalTime.split("T").slice(-1)[0].split(":");
      let arriveTimeString = arriveTimeStrings[0] + ":" + arriveTimeStrings[1];

      let userDepartTime:string;
      let userArriveTime:string;
      this.departTime ? userDepartTime = this.departTime.toString() : userDepartTime = "23:59";
      this.arrivalTime ? userArriveTime = this.arrivalTime.toString() : userArriveTime = "23:59";

      //determine what airlines are available.
      let includedAirlines = trip.departingFlight.airlines.every(airline => this.selectedAirlines.includes(airline));

      if (trip.departingFlight.numberOfStops <= chosenStops &&
          trip.flightPrice <= this.totalPrice[1] &&
          trip.flightPrice >= this.totalPrice[0] &&
          totalTripTime <= (this.maxTravelTime * 3600) &&
          totalFlightTime <= (this.maxFlightTime * 3600) &&
          departTimeString <= userDepartTime &&
          arriveTimeString <= userArriveTime &&
          this.selectedDepartAirports.includes(trip.departingFlight.departureAirport) &&
          this.selectedArrivalAirports.includes(trip.departingFlight.arrivalAirport) &&
          includedAirlines
          )
      {
        newTripArr.push(trip);
      }
    });
    this.filteredTrips = newTripArr;
    this.loaded = 10;
    this.displayTrips = this.filteredTrips.slice(0,this.loaded);
    if(this.filteredTrips.length > this.loaded) {
      this.shouldLoad = true;
    } else {
      this.shouldLoad = false;
    }
  }

  resetFilter() {
    this.logger.info("Resetting filter");

    this.filteredTrips = this.trips;
    this.displayTrips = this.filteredTrips.slice(0,this.loaded);
    if(this.filteredTrips.length > this.loaded) {
      this.shouldLoad = true;
    } else {
      this.shouldLoad = false;
    }
  }

}