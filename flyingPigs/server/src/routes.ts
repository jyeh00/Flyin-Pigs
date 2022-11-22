import e, * as express from "express";
import {airportFinder} from "./findAirports";
export const mongoRouter = express.Router();
import {flightsApi} from "./flightsApi";
mongoRouter.use(express.json());
var Airport = require("./airport");
import log4js from "log4js";
import { TravelMode } from "@googlemaps/google-maps-services-js";
import { Trip, ResultInfo, sortTrips, removeDuplicates, Flight } from "./flight";
import { ObjectId } from "mongodb";
import { mongo } from "mongoose";
import { timeStamp } from "console";
const crypto = require('crypto');
var logger = log4js.getLogger();
var Credentials = require("./credentials");
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');


mongoRouter.get("/", async (_req, res) => {
    try {
        //let airportsCollection = mongoose.model('Airport');
        const airports = await Airport.find({});
        res.status(200).send(airports);
    } catch (error) {
        res.status(500).send(error.message);
    }
});



mongoRouter.post("/search", async (req, res) => {
    try {
        let searchParams = req.body;

        let tripList:Trip[] = [];
        let resultInfo: ResultInfo = {
            airlines: [],
            depAirports: [],
            arrAirports: [],
            minPrice: 0,
            maxPrice: 0,
            trips: [],
        };
        let airlinesDuplicates: string[] = [];

        let myDepFinder = new airportFinder();
        let depPrefilter = await myDepFinder.findAirportsInRange(searchParams.departCoord.lat, searchParams.departCoord.lng, searchParams.maxTimeStart.sec, searchParams.selectedDTransport.code);        
        let depAirportArray = await myDepFinder.findAirports(searchParams.departCoord.lat, searchParams.departCoord.lng, depPrefilter, searchParams.maxTimeStart.sec, searchParams.selectedDTransport.code);
        let myArrFinder = new airportFinder();
        // let arrPrefilter = await myArrFinder.findAirportsInRange(searchParams.departCoord.lat, searchParams.departCoord.lng, searchParams.maxTimeStart.sec, searchParams.selectedTransport.code);
        let arrPrefilter = await myArrFinder.findAirportsInRange(searchParams.arriveCoord.lat, searchParams.arriveCoord.lng, searchParams.maxTimeEnd.sec, searchParams.selectedATransport.code);        
        // let arrAirportArray = await myArrFinder.findAirport(searchParams.departCoord.lat, searchParams.departCoord.lng, arrPrefilter, searchParams.maxTimeStart.sec, searchParams.selectedTransport.code);
        let arrAirportArray = await myArrFinder.findAirports(searchParams.arriveCoord.lat, searchParams.arriveCoord.lng, arrPrefilter, searchParams.maxTimeEnd.sec, searchParams.selectedATransport.code);
        // console.log(arrAirportArray);
        let trips = [];

        if(searchParams.selectedDTransport.code === searchParams.selectedATransport.code) {
            let emptyFlight = new Flight("", "", "", "", 0, 0);
            emptyFlight.addAirline(searchParams.selectedDTransport.name);
            let times = await myDepFinder.getDistanceInSec(searchParams.departCoord, searchParams.arriveCoord, searchParams.selectedDTransport.code);
            let tempTrip: Trip;
            if(searchParams.isRoundTrip) {
                tempTrip = new Trip(0, 0, 0, emptyFlight, emptyFlight, Infinity);
                tempTrip.setTotalDepTime(times.timeTo);
                tempTrip.setTotalRetTime(times.timeBack);
            }
            else{
                tempTrip = new Trip(0, 0, 0, emptyFlight, undefined, Infinity);
                tempTrip.setTotalDepTime(times.timeTo);
            }
            trips.push(tempTrip);
        }
        else {            
            let emptyFlight1 = new Flight("", "", "", "", 0, 0);
            emptyFlight1.addAirline(searchParams.selectedDTransport.name);
            let emptyFlight2 = new Flight("", "", "", "", 0, 0);
            emptyFlight2.addAirline(searchParams.selectedATransport.name);

            let times1 = await myDepFinder.getDistanceInSec(searchParams.departCoord, searchParams.arriveCoord, searchParams.selectedDTransport.code);
            let times2 = await myDepFinder.getDistanceInSec(searchParams.departCoord, searchParams.arriveCoord, searchParams.selectedATransport.code);
            let tempTrip1: Trip;
            let tempTrip2: Trip;
            if(searchParams.isRoundTrip) {
                tempTrip1 = new Trip(0, 0, 0, emptyFlight1, emptyFlight1, Infinity);
                tempTrip1.setTotalDepTime(times1.timeTo);
                tempTrip1.setTotalRetTime(times1.timeBack);

                tempTrip2 = new Trip(0, 0, 0, emptyFlight2, emptyFlight2, Infinity);
                tempTrip2.setTotalDepTime(times2.timeTo);
                tempTrip2.setTotalRetTime(times2.timeBack);
            }
            else{
                tempTrip1 = new Trip(0, 0, 0, emptyFlight1, undefined, Infinity);
                tempTrip1.setTotalDepTime(times1.timeTo);

                tempTrip2 = new Trip(0, 0, 0, emptyFlight2, undefined, Infinity);
                tempTrip2.setTotalDepTime(times2.timeTo);
            }
            trips.push(tempTrip1);    
            trips.push(tempTrip2);       
        }

        for(let i = 0; i < depAirportArray.length; i++) {
            resultInfo.depAirports.push(depAirportArray[i].IATA);
            for(let j = 0; j < arrAirportArray.length; j++) {
                if(i == 0) {
                    resultInfo.arrAirports.push(arrAirportArray[j].IATA);
                }
                if(depAirportArray[i].IATA !== arrAirportArray[j].IATA){
                    let myFlightApi = new flightsApi(depAirportArray[i].IATA, arrAirportArray[j].IATA, searchParams.departDate, searchParams.returnDate, 
                        searchParams.adultPass, searchParams.childPass, searchParams.infantPass, searchParams.selectedClass.code, !searchParams.isRoundTrip,
                        depAirportArray[i]["TravelTime"], arrAirportArray[j]["TravelTime"]);
                    trips.push(myFlightApi.queryApi());
                }
            }
        }
        
        tripList = await Promise.all(trips)
        tripList = tripList.flat();

        resultInfo.trips = sortTrips(tripList, "flightPrice");
        resultInfo.minPrice = resultInfo.trips[0].flightPrice;
        resultInfo.maxPrice = resultInfo.trips[tripList.length - 1].flightPrice;
        
        tripList.forEach(function(trip, index) {
            logger.info("airlines for one trip", trip.departingFlight.airlines);
            airlinesDuplicates = airlinesDuplicates.concat(trip.departingFlight.airlines);
            if(trip.returningFlight) {
                airlinesDuplicates = airlinesDuplicates.concat(trip.returningFlight.airlines);
            }
        });
        resultInfo.airlines = removeDuplicates(airlinesDuplicates);
        logger.info("all airlines: ", resultInfo.airlines);
        logger.info("resultInfo.depAirports: ", resultInfo.depAirports);
        logger.info("resultInfo.arrAirports: ", resultInfo.arrAirports);
        logger.info("resultInfo: ", resultInfo);
        res.status(200).send(resultInfo);

    } catch (error) {
        res.status(500).send(error.message);
    }
});

mongoRouter.post("/log", async (req, res) => {
    let level = req.body.level;
    let msg = req.body.message;
    let filename = req.body.fileName;
    let lineNumber = req.body.lineNumber;
    let columnNumber = req.body.columnNumber;
    //add switch case for different levels (debug, error, trace, etc)
    logger.info("clientside file " + filename + " " + msg + " line " + lineNumber + " col " + columnNumber);
});

mongoRouter.post("/login", async (req, res) => {
    let cred = await Credentials.findOne({email: req.body.email});
    // if email exists in DB, check if passwords match
    if(cred) {
        bcrypt.compare(req.body.password, cred["password"]).then(
            passwordMatch => passwordMatch ? res.status(200).send(true): res.status(200).send(false)
        );
    } else {
        logger.info("Log in failure: user does not exist");
        res.status(200).send(false);
    }
});

mongoRouter.post("/signup", async (req, res) => {
    const saltRounds = 10;
    let cred = await Credentials.findOne({email: req.body.email});
    // if email doesnt already exist, hash pass and add to DB
    if(!cred) {
        const newUser = new Credentials({
            _id: new ObjectId(),
            email: req.body.email,
            password: req.body.password
        });
        bcrypt.genSalt(saltRounds, function(err, salt) {
            bcrypt.hash(req.body.password, salt, function(err, hash) {
                newUser.password = hash;
                newUser.save()
                if(!err) {
                    res.status(200).send(true)
                } else {
                    res.status(200).send(false)
                }
            });
        });
    } else {
        logger.info("Sign up failure: user already exists");
        res.status(200).send(false);
    }

});

mongoRouter.post('/resetPassword', (req, res) => {
    console.log("INSIDE RESET PASSWORD ROUTE");
    console.log("reset password req: ", req);
    Credentials.findOne({resetPasswordToken: req.body.token}).then((user) => {
        if (!user) {
            // res.status(200).send({
            //     message: 'invalid-link',
            // });
            logger.info("NO USER WITH SPECIFIED TOKEN")
            res.status(200).send(false);

            // console.error('password reset link is invalid or has expired');
            // res.status(403).send({message: 'password reset link is invalid or has expired'});
        } else {
            console.log("USER", user);
            console.log("FOUND RESET PASSWORD USER");
            console.log("type of resetPasswordExpires", typeof user.resetPasswordExpires);
            console.log("resetPasswordExpires", user.resetPasswordExpires);
            if(user.resetPasswordExpires > Date.now()) {
                console.log("Valid reset link, time token is valid");
                const saltRounds = 10;

                user.resetPasswordToken = -1;
                user.resetPasswordExpires = -1;
                bcrypt.genSalt(saltRounds, function(err, salt) {
                    bcrypt.hash(req.body.password, salt, function(err, hash) {
                        user.password = hash;
                        user.save();
                        if(!err) {
                            res.status(200).send(true);
                        } else {
                            res.status(200).send(false);
                        }
                    });
                });
                // user.save()
                //     .then(user => res.json(user))
                //     .catch(err => console.log(err));

                // res.status(200).send({
                //     username: user.email,
                //     message: 'valid-link',
                // });
            }
            else {
                console.log("RESET PASSWORD LINK EXPIRED");
                // res.status(200).send({
                //     message: 'invalid-link',
                // });
                logger.info("RESET PASSWORD LINK EXPIRED")

                res.status(200).send(false);
                // console.error('password reset link is invalid or has expired');
                // res.status(403).send({message: 'password reset link is invalid or has expired'});
            }

        }
    });
});

mongoRouter.post("/submitForgotPassword", (req, res) =>
{
    // console.log("SUBMIT FORGOT PASSWORD REQ: ", req);
    Credentials.findOne({email: req.body.email}).then((user) => {

        if(user) {
            console.log('found user forgot password');
            //generate a unique hash token
            const token = crypto.randomBytes(20).toString('hex');

            //update the user with the token and set it to expire in 10 minutes

            user.resetPasswordToken = token;
            user.resetPasswordExpires = Date.now() + 600000;
            user.save()
                .then(user => res.json(user))
                .catch(err => console.log(err));


            var transporter = nodemailer.createTransport({
                service: 'gmail',
                //     //put credentials into an .env file later and include it in .gitignore
                // user: `${process.env.EMAIL_ADDRESSS}`,
                // pass: `${process.env.EMAIL_PASSWORD}`,
                auth: {
                    user: 'flyinpigs407@gmail.com',
                    pass: 'gseexbubldnyjdvu'
                }
            });
                
            var mailOptions = {
                from: 'flyinpigs407@gmail.com',
                to: req.body.email,
                subject: `Password Reset Link`,
                text: `click the link below to change your password:\n\nhttp://localhost:4200/reset-password?token=${token}`,
            };
                
            transporter.sendMail(mailOptions, function(error, info){
                if (error) {
                    console.log(error);
                    res.status(200).send(false)
                } else {
                    console.log('Email sent: ' + info.response);
                    res.status(200).send(true)
                }
            });

            // const transporter = nodemailer.createTransport({
            //     service: 'gmail',

            //     //put credentials into an .env file later and include it in .gitignore
            //     // user: `${process.env.EMAIL_ADDRESSS}`,
            //     // pass: `${process.env.EMAIL_PASSWORD}`,
            //     auth: {
            //         user: "flyinpigs407@gmail.com",
            //         pass: "BrickHouse407",
            //     }
            // });

            // const mailOptions = {
            //     from: `flyinpigs407@gmail.com`,
            //     to: req.body.email,
            //     subject: `Password Reset Link`,
            //     text: `click the link below to change your password:\n\nhttp://localhost:3000/reset/${token}`,
            // };

            // transporter.sendMail(mailOptions, (err, response) => {
            //     if(err) {
            //         //error
            //     }
            //     else {
            //         //sent
            //         console.log("email sent");
            //     }
            // });
        }
        else {
            // return res.status(403).json({email: "Email doesn't exist."});
            res.status(200).send(false)
        }
    })
    
});
