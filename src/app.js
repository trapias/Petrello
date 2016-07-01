/**
 * Petrello
 *
 * A simple Trello client for Pebble smartwatches
 * Alberto Velo, http://trapias.github.io
 *
 * Changelog:
 * - 1.3: bugfix, was unable to load boards not belonging to an organization
 * - 1.4: 
 *   - fix accelerator refreshes
 *   - fix token usage after first setup
 *   - change actionbar to black, with Pebble std icons
 *   - show due date on cards
 *   - new submenu for the card level, allows to perform more actions
 *   - new capability to move a card to another list
 * - 1.5:
 *   - refactored navigation with a main menu and new ways to navigate Trello data
 *   - bugfixes
 * - 1.6:
 *   - new function to set timeline pins for assigned cards with a due date
 */
var UI = require('ui');
var Vector2 = require('vector2');
var Vibe = require('ui/vibe');
var ajax = require('ajax');
var Feature = require('platform/feature');
var Accel = require('ui/accel');
var Settings = require('settings');
// var Timeline = require('timeline');
var Timeline = require('./timeline');

// globals
var organizations = [], lists = [];
var currentView=null, currentBoardID = null, currentCardID = null, currentMenu = null, currentFilter=null, currentParam=null, currentBoardName=null, currentlistID = null, currentlistTitle = null;
var token = Settings.option('token');
// please manually set token here to test with pebble emulator

// Set a configurable with just the close callback
Settings.config(
   { url: 'https://trello.com/1/authorize?callback_method=fragment&scope=read,write&expiration=never&name=Petrello&key=12336dca832251b5d7405c340e278b9f&return_url=http://trapias.github.io/petrello.html' },
   function(e) {
     console.log('closed configurable');
     // Show the parsed response
     // console.log(JSON.stringify(e.options));
     // Show the raw response if parsing failed
     if (e.failed) {
       console.log(e.response);
     }
   }
 );

// Pebble.addEventListener('ready', function() {
  var main = new UI.Window({
      backgroundColor: 'black'
    });

    var image = new UI.Image({
      position: new Vector2(0, 5),
      size: new Vector2(144, 168),
      image: 'images/logo_splash.png'
    });
    main.add(image);

    var pTitle = new UI.Text({
      position: new Vector2(0, 0),
      size: new Vector2(144, 60),
      font: 'gothic-24-bold',
      text: 'Petrello',
      textAlign: 'center'
    });
    main.add(pTitle);

    var pFooter = new UI.Text({
      position: new Vector2(0, 140),
      size: new Vector2(144, 60),
      font: 'gothic-24-bold',
      text: 'Press any key',
      textAlign: 'center'
    });
    main.add(pFooter);

    main.on('click', 'up', function(e) {
      ShowMainMenu();
    });

    main.on('click', 'down', function(e) {
      ShowMainMenu();
    });

    main.on('click', 'select', function(e) {
      ShowMainMenu();
    });
    
  main.show();
// });

Accel.on('tap', function(e) {
  console.log('Tap event on axis: ' + e.axis + ' and direction: ' + e.direction + ', currentView = ' + currentView);
  
  // monitor the x axis to test with emulator, y in real app so to monitor wrist twist
  if(e.axis==='y') {
    // refresh current view
    switch(currentView) {
      case 'Boards':
        if(currentMenu!==null) {
          currentMenu.hide();
        }
        organizations=[];
        ShowBoards(currentFilter, currentParam);
        Vibe.vibrate('double');
        break;

        case 'Lists':
        if(currentMenu!==null) {
          currentMenu.hide();
        }
        lists=[];
        ShowLists(currentBoardID, currentBoardName);
        Vibe.vibrate('double');
        break;

        case 'List':
        ShowList(currentlistID, currentlistTitle);
        break;

        case 'Card':
        if(currentMenu!==null) {
          currentMenu.hide();
        }
        ShowCard(currentCardID);
        Vibe.vibrate('double');
        break;

        case 'CheckList':
        if(currentMenu!==null) {
          currentMenu.hide();
        }
        ShowCheckLists(currentCardID);
        Vibe.vibrate('double');
        break;

        case 'MyCards':
        ShowMyCards();
        break;

        case 'Organizations':
        ShowOrganizations();
        break;

        default:
        // do nothing
        break;
    }
    
  }
});

function arrayContainsValue(arr, val) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].id === val) {
      return true;
    }
  }
  return false;
}

function Loading(title) {
  var win = new UI.Window({
    backgroundColor: 'white'
  });

  var image = new UI.Image({
    position: new Vector2(58, 40),
    size: new Vector2(28, 28),
    image: 'images/menu_icon.png'
  });
  win.add(image);

  var pFooter = new UI.Text({
    position: new Vector2(0, 140),
    size: new Vector2(144, 60),
    font: 'gothic-24-bold',
    text: title,
    textAlign: 'center',
    color: 'black'
  });
  win.add(pFooter);
  
  win.show();
  return win;
}

function ShowMainMenu() {
  if(token===undefined) {
    // re-read token, fix issue at first run (avoid having to close and open again watchapp)
    token = Settings.option('token');
  }
  if(token===undefined) {
    PleaseConfigure();
    return;
  }

  var menu = new UI.Menu( {
    highlightBackgroundColor: Feature.color('vivid-violet', 'dark-gray'),
        icon: 'images/menu_icon.png',
        sections: [{
          title: 'Select a section',
          backgroundColor: 'black',
          textColor: 'white',
          items: [
            {
              title: 'Starred boards',
              icon: 'images/star-icon.png'
            },
            {
              title: 'My boards',
              icon: 'images/menu_icon.png'
            },
            {
              title: 'Organizations',
              icon: 'images/menu_icon.png'
            },
            {
              title: 'All boards',
              icon: 'images/menu_icon.png'
            },
            {
              title: 'My cards',
              icon: 'images/icon-user.png'
            },
            {
              title: 'Set Timeline',
              icon: 'images/TIMELINE_CALENDAR.png'
            }
          ]
        }]
  });

  menu.on('select', function(e) {
    switch(e.itemIndex) {
      case 0:
      ShowBoards('starred');
      break;

      case 1: // boards without an organization
      ShowBoards('private');
      break;

      case 2: // organizations
      ShowOrganizations();
      break;

      case 3: // all boards
      ShowBoards('open');
      break;

      case 4:
      ShowMyCards();
      break;

      case 5:
      TimelinePins();
      break;

      }
  });

  menu.show();
}

function TimelinePins() {
  var card = new UI.Card({
    title: 'Send to timeline',
    body: 'By clicking the select button you will add a timeline pin for each of your Trello cards (assigned to you) that have a due date suitable for the timeline (no more than two days in the past, or a year in the future).',
    scrollable: true,
    action: {
      backgroundColor: 'black',
      select: 'images/TIMELINE_CALENDAR.png'     // cards actions menu
    }
  });

  card.on('click', 'select', function() {
    // console.log('Selected item #' + e.itemIndex + ' of section #' + e.sectionIndex);
    card.hide();
    SetTimelinePins();
  });

  card.show();

}

function SetTimelinePins() {
  var card = Loading('Loading my cards...');
  var cardsFound=0, pinsSet=0;
  var now = new Date();
  var pastTwoDays=new Date(now.getFullYear(),now.getMonth(),now.getDate()-2, now.getHours(), now.getMinutes(), now.getSeconds());
  var nextYear=new Date(now.getFullYear()+1,now.getMonth(),now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());

  ajax({
      url: 'https://api.trello.com/1/member/me/cards?members=true&filter=open&fields=name,desc,due&key=12336dca832251b5d7405c340e278b9f&token=' + token,
      type: 'json'
    },
    function(data, status, request) {

      var cards = [];

      // step1: parse cards
      for(var b = 0; b < data.length; b++) {
        var theCard = data[b];

        if(theCard.closed) {continue;}

        cardsFound++;
          
        if(theCard.due!==undefined && theCard.due!==null && theCard.due!=="") {
          var cardDate = new Date(theCard.due);
          if(cardDate >= pastTwoDays && cardDate <= nextYear) {
               var pin = {
              "id": theCard.id,
              "time": theCard.due,
              "layout": {
                "type": "genericPin",
                "title": theCard.name,
                "subtitle": "Petrello reminder",
                "body": theCard.desc,
                "tinyIcon": "system://images/SCHEDULED_EVENT"
              }
            };
            console.log('INSERT PIN ' + JSON.stringify(pin));
            Timeline.insertUserPin(pin, pinCallback);
            pinsSet++;
          }
         
        }
      }

      // display results
      card.hide();

      var sBody='';
      if(cardsFound===0) {
        sBody = 'No assigned card was found, so no pins have been sent to the timeline.';
      } else {
        if(pinsSet>0) {
          sBody = cardsFound + ' cards have been evaluated, and ' + pinsSet + ' pins have been sent to the timeline. ';
        } else {
          sBody = cardsFound + ' cards have been evaluated, but none has a valid due date. No pins have been sent to the timeline';
        }
      }
      sBody += ' Please press the back button to go back to main menu.';

      var resultCard = new UI.Card({
        title: 'Completed',
        scrollable: true,
        body: sBody
      });

      resultCard.show();

    },
    function(error, status, request) {
      console.log('The ajax request failed: ' + error + ', status: ' + status);
      card.hide();
      ShowError(error);
    });
}

function ShowMyCards() {
  if(token===undefined) {
    // re-read token, fix issue at first run (avoid having to close and open again watchapp)
    token = Settings.option('token');
  }
  if(token===undefined) {
    PleaseConfigure();
    return;
  }

  var card = Loading('Loading my cards...');
  
   ajax({
      url: 'https://api.trello.com/1/member/me/cards?members=true&filter=open&fields=name,idBoard,idList,due,desc&key=12336dca832251b5d7405c340e278b9f&token=' + token,
      type: 'json'
    },
    function(data, status, request) {

      // lists = [{title: 'My cards', items: []}];
      lists = [];
      var cards = [];

      // step1: parse cards
      for(var b = 0; b < data.length; b++) {
        var theCard = data[b];

        if(theCard.closed) {continue;}
          
          if(!arrayContainsValue(lists, theCard.idList)) {
              lists.push({
                id: theCard.idList,
                items: [],
              });
            // }
          }
            
          cards.push({
            title: theCard.name,
            id: theCard.id,
            idBoard: theCard.idBoard,
            idList: theCard.idList,
          });
      }

      for(var l=0; l < lists.length; l++) {
        for(var c=0; c < cards.length; c++) {
          // append cards to lists
          // console.log('card idlist ' + cards[c].idList + ' VS ' + lists[l].id);
          if(cards[c].idList == lists[l].id) {
            // console.log('adding card ' + cards[c].title + ' to list ' + lists[l].title);
            lists[l].items.push(cards[c]);
          }
        }
      }

      currentView = 'MyCards';
      LoadMyCardsSections(card);

    },
    function(error, status, request) {
      console.log('The ajax request failed: ' + error + ', status: ' + status);
      card.hide();
      ShowError(error);
    });
}

function pinCallback(text) {
  console.log('Pin inserted: ' + text);
}

var listTitles=[];

function getListTitle(id) {
  // console.log('getListTitle ' + id + ' vs ' + JSON.stringify(listTitles));
  for(var r=0; r < listTitles.length; r++) {
    if(listTitles[r].id === id) {
      return listTitles[r].title;
    }
  }
  return '';
}

function myCardsCallback(card) {
  // console.log('myCardsCallback: ' + JSON.stringify(lists));
  card.hide();

  var finalList = [];
  for(var i=0; i<lists.length; i++) {
    finalList.push({
      id: lists[i].id,
      title: getListTitle(lists[i].id),
      items: lists[i].items,
      backgroundColor: Feature.color('black', 'black'),
      textColor: Feature.color('white', 'white')
    });
  }

  var itemsMenu = new UI.Menu({
      highlightBackgroundColor: Feature.color('vivid-violet', 'dark-gray'),
      sections: finalList
    });

    itemsMenu.on('select', function(e) {
      // console.log('Selected item #' + e.itemIndex + ' of section #' + e.sectionIndex);
      ShowCard(e.item.id);
    });

  itemsMenu.show();
  currentMenu = itemsMenu;
}


function LoadMyCardsSections(card) {
  var nAll = lists.length, nCompleted=0;
  listTitles = [];

  for(var i=0; i<nAll; i++) {
    // console.log('get title for list id ' + lists[i].id + ' with title ' + lists[i].title);

    // console.log('get title for list ' + thisList.id);

    ajax({
      url: 'https://api.trello.com/1/lists/' + lists[i].id + '?board=true&fields=name&board_fields=name&key=12336dca832251b5d7405c340e278b9f&token=' + token,
      type: 'json',
      async: true
    },
    function(data, status, request) {
      listTitles.push({
        id: data.id,
        boardID: data.board.id,
        boardName: data.board.name,
        title: data.board.name + '>' + data.name
      });
      nCompleted++;
      if(nCompleted===nAll) {myCardsCallback(card);}
    },
    function(error, status, request) {
      console.log('The ajax request failed: ' + error + ', status: ' + status);
      // nCompleted++;
      // if(nCompleted===nAll) {myCardsCallback(card);}
      ShowError(error);
      return;
    }); 
  }
}

function ShowBoards(filter, param) {
  if(token===undefined) {
    // re-read token, fix issue at first run (avoid having to close and open again watchapp)
    token = Settings.option('token');
  }
  if(token===undefined) {
    PleaseConfigure();
    return;
  }

  var card = Loading('Loading Boards...');

  if(organizations.length>0 && currentFilter===filter && currentParam===param) {
    // already loaded (cached)
    console.log('LOAD BOARDS FROM CACHE');
    card.hide();
    buildBoardsMenu(organizations);
    return;
  }

  // save to allow refresh via accellerator
  currentFilter=filter;
  currentParam = param;

  // console.log("token? " + Settings.option('token'));
  // console.log("createpins? " + Settings.option('createpins'));
  // console.log('OPTIONS: ' + JSON.stringify(options));
  
  // console.log('OPTIONS: ' + Settings.option());
  // console.log('ShowBoards: token = ' + token);
  // console.log('OPTIONS: ' + JSON.stringify(Settings.option()));
  
  // console.log('LOAD BOARDS FROM NETWORK');
  organizations = []; // reset 
  var sFilter = 'open', onlyPriv = false, singleOrgID = null;
  if(filter!==null) {

    switch(filter) {
      case 'private':
      onlyPriv = true;
      break;

      case 'organization':
      singleOrgID = param;
      break;

      default:
      sFilter = filter;
    }
  }

  ajax({
      url: 'https://api.trello.com/1/member/me/boards?fields=name,idOrganization,closed&filter=' + sFilter + '&organization=true&key=12336dca832251b5d7405c340e278b9f&token=' + token,
      type: 'json'
    },
    function(data, status, request) {

      // console.log('DATA: ' + JSON.stringify(data));
      
      // step1: parse organizations
      for(var b = 0; b < data.length; b++) {
        var theBoard = data[b];

        if(theBoard.closed===true) {continue;} // only show open boards
        if(theBoard.organization!==undefined) {
          if(onlyPriv===true) {continue;}
          if(singleOrgID!==null && theBoard.organization.id !== singleOrgID) {continue;}
          if(!arrayContainsValue(organizations, theBoard.organization.id)) {
            organizations.push({
              title: theBoard.organization.displayName,
              id: theBoard.organization.id,
              idBoards: theBoard.idBoards,
              items: [],
              backgroundColor: Feature.color('black', 'black'),
              textColor: Feature.color('white', 'white')
            });
          }
        } else {
          if(singleOrgID!==null) {continue;}
          if(!arrayContainsValue(organizations, null)) {
            organizations.push({
              title: 'My Boards',
              id: null,
              idBoards: theBoard.idBoards,
              items: [],
              backgroundColor: Feature.color('black', 'black'),
              textColor: Feature.color('white', 'white')
            });
          }
        }
        
      }

      // step2: add boards to organizations
      for(var o = 0; o < organizations.length; o++) {
        for(b = 0; b < data.length; b++) {
          var aBoard = data[b];
          if(aBoard.closed===true) {continue;} // only show open boards
          if(aBoard.organization!==undefined) {
            if(onlyPriv===true) {continue;}
            if(singleOrgID!==null && aBoard.organization.id !== singleOrgID) {continue;}
            if(aBoard.organization.id === organizations[o].id) {
              // add to org items
              organizations[o].items.push({
                title: aBoard.name,
                id: aBoard.id
              });
            }
          } else {
            if(singleOrgID!==null) {continue;}
            if(null === organizations[o].id) {
              // add to org items
              organizations[o].items.push({
                title: aBoard.name,
                id: aBoard.id
              });
            }
          }
        }
      }

      card.hide();

      if(organizations.length===0 || organizations[0].items.length===0) {
        var empty = new UI.Card({
          title: 'No data',
          body: 'No open boards found'
        });

        empty.on('hide', function() {
          console.log('hide empty');
        });
        empty.show();
        return;
      }

      buildBoardsMenu(organizations);

    },
    function(error, status, request) {
      console.log('The ajax request failed: ' + error + ', status: ' + status);
      card.hide();
      ShowError(error);
    });
}

function buildBoardsMenu(organizations) {
      var itemsMenu = new UI.Menu({
        highlightBackgroundColor: Feature.color('vivid-violet', 'dark-gray'),
        sections: organizations
      });

      itemsMenu.on('select', function(e) {
        // console.log('Selected item #' + e.itemIndex + ' of section #' + e.sectionIndex);
        // console.log('The Board is titled "' + e.item.title + '" and has id ' + e.item.id);
        // open board menu (list its Lists)
        ShowLists(e.item.id, e.item.title);
      });

      currentView = 'Boards';
      itemsMenu.show();
      currentMenu = itemsMenu;
}

function ShowLists(boardID, boardTitle) {
  // lists with cards and id of checklists for each card

  var card = Loading('Loading Lists...');

  if(lists.length>0 && currentBoardID===boardID) {
    // already loaded (cached)
    console.log('LOAD LISTS FROM CACHE');
    card.hide();
    buildListsMenu(lists, currentBoardName);
    return;
  }

  lists = [];
  currentBoardID = boardID;
  // console.log('LOAD LISTS FROM NETWORK');
  ajax({
      url: 'https://api.trello.com/1/boards/' + boardID + '/lists?cards=open&filter=open&fields=name,idBoard&card_fields=name,idChecklists&key=12336dca832251b5d7405c340e278b9f&token=' + token,
      type: 'json'
    },
    function(data, status, request) {

      // step1: parse lists
      for(var b = 0; b < data.length; b++) {
        var theList = data[b];
        if(!arrayContainsValue(lists, theList.id)) {
          if(theList.cards.length>0) {
            lists.push({
              title: theList.name,
              id: theList.id,
              idBoard: theList.idBoard,
              items: [],
              backgroundColor: Feature.color('black', 'black'),
              textColor: Feature.color('white', 'white')
            });
          }
        }
      }

      card.hide();
      buildListsMenu(lists,boardTitle);

    },
    function(error, status, request) {
      console.log('The ajax request failed: ' + error + ', status: ' + status);
      card.hide();
      ShowError(error);
    });

}

function buildListsMenu(lists, boardTitle) {
    var itemsMenu = new UI.Menu({
        highlightBackgroundColor: Feature.color('vivid-violet', 'dark-gray'),
        sections: [{
          title: 'Lists in ' + boardTitle,
          backgroundColor: 'black',
          textColor: 'white',
          items: lists
        }]
      });

      itemsMenu.on('select', function(e) {
        // console.log('Selected item #' + e.itemIndex + ' of section #' + e.sectionIndex);
        ShowList(e.item.id, e.item.title);
      });

      currentView = 'Lists';
      currentBoardName = boardTitle;
      itemsMenu.show();
      currentMenu = itemsMenu;
}

function ShowCard(cardID) {
  var card = Loading('Loading Card...');

  ajax({
      url: 'https://api.trello.com/1/card/' + cardID + '?members=true&key=12336dca832251b5d7405c340e278b9f&token=' + token,
      type: 'json'
    },
    function(data, status, request) {
      // console.log('data: ' + JSON.stringify(data));

      card.hide();
      var w = null;

      w = new UI.Card({
        title: data.name,
          backgroundColor: 'white',
          scrollable: true,
          action: {
            backgroundColor: 'black',
            select: 'images/music_icon_ellipsis.png'     // cards actions menu
          }
        });

      if(data.due!==null && data.due!=="") {
        // w.subicon('images/TIMELINE_CALENDAR.png');
        w.icon('images/TIMELINE_CALENDAR.png');
        var dt = new Date(data.due);
        var options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' };
        w.subtitle('Due ' + dt.toLocaleDateString(dt.getTimezoneOffset(),options) + ' ' + dt.toLocaleTimeString(dt.getTimezoneOffset(),options));
      }

      // too big text causes an exception! 
      if(data.desc===null) {data.desc='';}
      if(data.desc.length>420) {
        w.body(data.desc.substr(0,420) + '...');
      } else {
        w.body(data.desc);
      }
      
      w.on('click', 'select', function() {
        ShowCardMenu(data);
      });
     
     currentView = 'Card';
     currentCardID = cardID;
      w.show();

    },
    function(error, status, request) {
      console.log('The ajax request failed: ' + error);
      card.hide();
      ShowError(error);
    });
}

function ShowCardMenu(card) {
  // console.log('CARD: ' + JSON.stringify(card));
  var cardID =card.id, checkItems = card.badges.checkItems; //, members = card.members;

  var items=[{
              title: 'Move Card',
              idCard: cardID,
              icon: 'images/move_icon.png'
            }];

  if(checkItems>0) {
    items.push({
      title: 'Checklists',
      idCard: cardID,
      icon: 'images/Listicon.png'
    });
  }

  // if(members.length>0) {
  //   items.push({
  //     title: 'Members',
  //     idCard: cardID,
  //     icon: 'images/Listicon.png'
  //   });
  // }

  var menu = new UI.Menu( {
    highlightBackgroundColor: Feature.color('vivid-violet', 'dark-gray'),
        icon: 'images/menu_icon.png',
        sections: [{
          title: 'Choose an action',
          backgroundColor: 'white',
          textColor: 'black',
          items: items
        }]
  });

  menu.on('select', function(e) {

    switch(e.itemIndex) {
      case 0:
      menu.hide();
      ShowMoveCardMenu(card);
      break;

      case 1:
      // move card to another list
      menu.hide();
      ShowCheckLists(cardID);
      break;
    }

  });

  menu.show();
}

function ShowMoveCardMenu(card) {
  //load lists
  var currentBoardLists = [];
  ajax({
      url: 'https://api.trello.com/1/boards/' + card.idBoard + '/lists?cards=open&filter=open&fields=name,idBoard&card_fields=name,idChecklists&key=12336dca832251b5d7405c340e278b9f&token=' + token,
      type: 'json'
    },
    function(data, status, request) {

      // parse lists
      for(var b = 0; b < data.length; b++) {
        var theList = data[b];
        if(!arrayContainsValue(currentBoardLists, theList.id)) {
          // console.log('List ' + theList.name + ' has ' + theList.cards.length + ' cards');
          currentBoardLists.push({
            title: theList.name,
            id: theList.id,
            idBoard: theList.idBoard
          });
        }
      }

      var menu = new UI.Menu( {
        highlightBackgroundColor: Feature.color('vivid-violet', 'dark-gray'),
            icon: 'images/menu_icon.png',
            sections: [{
              title: 'Move card to...',
              backgroundColor: 'black',
              textColor: 'white',
              items: currentBoardLists
            }]
      });

      menu.on('select', function(e) {
        // move card to list e.item.id
        console.log('Move card to list ' + e.item.title + ', ' + e.item.id);
          ajax({
            url: 'https://api.trello.com/1/card/' + card.id + '?idList=' + e.item.id + '&key=12336dca832251b5d7405c340e278b9f&token=' + token,
            type: 'json',
            method: 'put'
          },
          function(data, status, request) {
            Vibe.vibrate('short');
            // reload card
            menu.hide();
            ShowCard(cardID);
            return;
          },
          function(error, status, request) {
            console.log('The ajax request failed: ' + error);
            // menu.clear(true);
            menu.hide();
            ShowError(error);
            return;
          });
      });

      menu.show();

    },
    function(error, status, request) {
      console.log('The ajax request failed: ' + error + ', status: ' + status);
      card.hide();
      ShowError(error);
    });
}

function ShowCheckLists(cardID,sectionIndex, itemIndex) {
  // console.log('ShowCheckList');
  var card = Loading('Loading Checklists...');
  
  var theData=null, allSections = [];
  // console.log('loading checklists...');
  
  ajax({
      url: 'https://api.trello.com/1/card/' + cardID + '/checklists?key=12336dca832251b5d7405c340e278b9f&token=' + token,
      type: 'json'
    },
    function(data, status, request) {
      theData = data;
      // console.log('DATA: ' + JSON.stringify(data));

      var currentData = null, sezioni = [];
      for(var cl = 0; cl < data.length; cl++) {
        currentData = data[cl];
        var items = [];

        for (var i = 0; i < currentData.checkItems.length; i++) {
          items.push({
            title: currentData.checkItems[i].name,
            icon: currentData.checkItems[i].state==='incomplete' ? 'images/unchecked.png' : 'images/checked.png',
            state: currentData.checkItems[i].state,
            idChecklist: currentData.checkItems[i].idChecklist,
            idCard: cardID,
            id: currentData.checkItems[i].id
          });
        }

        sezioni.push({title: currentData.name, icon: 'images/menu_icon.png', items: items });
      }
      
      allSections = sezioni;
      var itemsMenu = new UI.Menu({
        highlightBackgroundColor: Feature.color('vivid-violet', 'dark-gray'),
        icon: 'images/menu_icon.png',
        sections: sezioni
      });

      card.hide(); 
      
      itemsMenu.on('select', function(e) {
        // console.log('Selected item #' + e.itemIndex + ' of section #' + e.sectionIndex);
       
        // check or uncheck
        // PUT /1/cards/[card id or shortlink]/checkItem/[idCheckItem]
        var newState = allSections[e.sectionIndex].items[e.itemIndex].state === 'complete' ? 'incomplete' : 'complete';
        ajax({
          url: 'https://api.trello.com/1/card/' + cardID + '/checkItem/' + e.item.id + '?state=' + newState + '&key=12336dca832251b5d7405c340e278b9f&token=' + token,
          type: 'json',
          method: 'put'
        },
        function(data, status, request) {
          // console.log('Updated to ' + newState);
          Vibe.vibrate('short');
          // reload
          itemsMenu.hide();
          ShowCheckLists(cardID,e.sectionIndex, e.itemIndex);
          return;
        },
        function(error, status, request) {
          console.log('The ajax request failed: ' + error);
          card.hide();
          ShowError(error);
          return;
        });

      });

      itemsMenu.on('longSelect', function(e) {
        // console.log('LONGSelected item #' + e.itemIndex + ' of section #' + e.sectionIndex);       
        ShowCheckListItem(allSections[e.sectionIndex].title, allSections[e.sectionIndex].items[e.itemIndex].title, allSections[e.sectionIndex].items[e.itemIndex].state, cardID, allSections[e.sectionIndex].items[e.itemIndex].id );
      });

      currentCardID = cardID;
      currentView = 'CheckList';
      itemsMenu.show();
      currentMenu = itemsMenu;

      if(sectionIndex!==undefined && itemIndex!==undefined) {
        // console.log('selection: ' + sectionIndex + ',' + itemIndex);
        itemsMenu.selection(sectionIndex, itemIndex);  
      }
      
    },
    function(error, status, request) {
      console.log('The ajax request failed: ' + error);
      card.hide();
      ShowError(error);
    }
  );
}

function ShowCheckListItem(title, description, state, cardID, itemID) {
        var iwin = new UI.Card({
          backgroundColor: Feature.color('white', 'white'),
          icon: state ==='incomplete' ? 'images/unchecked.png' : 'images/checked.png',
          titleColor: 'black',
          bodyColor: 'black',
          title: title,
          body: description,
          scrollable: true,
          action: {
            backgroundColor: 'black',
            select: 'images/action_bar_icon_check.png'     // checklists
          }
        });

        iwin.on('click', 'select', function() {
        // console.log('Selected item #' + e.itemIndex + ' of section #' + e.sectionIndex);
       
        // check or uncheck
        // PUT /1/cards/[card id or shortlink]/checkItem/[idCheckItem]
        var newState = state === 'complete' ? 'incomplete' : 'complete';
        ajax({
          url: 'https://api.trello.com/1/card/' + cardID + '/checkItem/' + itemID + '?state=' + newState + '&key=12336dca832251b5d7405c340e278b9f&token=' + token,
          type: 'json',
          method: 'put'
        },
        function(data, status, request) {
          // console.log('Updated to ' + newState);
          Vibe.vibrate('short');
          // reload
          iwin.hide();
          ShowCheckListItem(title, description, newState, cardID, itemID);
          return;
        },
        function(error, status, request) {
          console.log('The ajax request failed: ' + error);
          iwin.hide();
          ShowError(error);
          return;
        });

      });

      iwin.show();       
}

function PleaseConfigure() {
        var iwin = new UI.Card({
          backgroundColor: Feature.color('white', 'white'),
          icon: 'images/menu_icon.png',
          titleColor: 'black',
          bodyColor: 'black',
          title: 'Missing token',
          body: 'Please obtain a Trello token opening the app settings on your phone'
        });
        iwin.show();       
}

function ShowOrganizations() {
  if(token===undefined) {
    // re-read token, fix issue at first run (avoid having to close and open again watchapp)
    token = Settings.option('token');
  }
  if(token===undefined) {
    PleaseConfigure();
    return;
  }

  var card = Loading('Loading Organizations...');

  ajax({
      url: 'https://api.trello.com/1/member/me/organizations?fields=displayName&key=12336dca832251b5d7405c340e278b9f&token=' + token,
      type: 'json'
    },
    function(data, status, request) {

      var orgs = [];
      for(var i=0; i < data.length; i++) {
        orgs.push({
          id: data[i].id,
          title: data[i].displayName
        });
      }
      var itemsMenu = new UI.Menu({
        highlightBackgroundColor: Feature.color('vivid-violet', 'dark-gray'),
        sections: [ {
          title: 'Organizations',
          backgroundColor: 'black',
          textColor: 'white',
          items: orgs
        }
        ]
      });

      itemsMenu.on('select', function(e) {
        // console.log('Selected item #' + e.itemIndex + ' of section #' + e.sectionIndex);
        ShowBoards('organization', e.item.id);
      });

      card.hide();
      currentView='Organizations';
      itemsMenu.show();

    },
    function(error, status, request) {
      console.log('The ajax request failed: ' + error + ', status: ' + status);
      // card.clear(true);
      card.hide();
      ShowError(error);
    });
}

function ShowList(listID, listTitle) {
  var card = Loading('Loading cards...');

  ajax({
      url: 'https://api.trello.com/1/lists/' + listID + '/cards?fields=name&filter=open&key=12336dca832251b5d7405c340e278b9f&token=' + token,
      type: 'json'
    },
    function(data, status, request) {

      var cards = [];
      for(var i=0; i < data.length; i++) {
        cards.push({
          id: data[i].id,
          title: data[i].name
        });
      }
      var itemsMenu = new UI.Menu({
        highlightBackgroundColor: Feature.color('vivid-violet', 'dark-gray'),
        sections: [ {
          title: 'Cards in ' + listTitle,
          backgroundColor: 'black',
          textColor: 'white',
          items: cards
        }
        ]
      });

      itemsMenu.on('select', function(e) {
        // console.log('Selected item #' + e.itemIndex + ' of section #' + e.sectionIndex);
        ShowCard(e.item.id);
      });

      card.hide();
      itemsMenu.show();
      currentView = 'List';
      currentlistID = listID;
      currentlistTitle=listTitle;

    },
    function(error, status, request) {
      console.log('The ajax request failed: ' + error + ', status: ' + status);
      // card.clear(true);
      card.hide();
      ShowError(error);
    });

}

function ShowError(err) {
  var errWin = new UI.Card({
        title: 'Error',
        body: err + '\nPlease report at github.com/trapias/Petrello'
      });
  errWin.show();
}

function getListBoardName(listID) {
 // console.log('getListBoardName ' + listID);
  ajax({
      url: 'https://api.trello.com/1/lists/' + listID + '?board=true&fields=name&board_fields=name&key=12336dca832251b5d7405c340e278b9f&token=' + token,
      type: 'json',
      async: false
    },
    function(data, status, request) {
      console.log('NAME: ' + data.board.name + ' > ' + data.name);
      return data.board.name + ' > ' + data.name;
    },
    function(error, status, request) {
      console.log('The ajax request failed: ' + error + ', status: ' + status);
      // card.clear(true);
      ShowError(error);
      return null;
    });  
}

