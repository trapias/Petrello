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
 */
var UI = require('ui');
var Vector2 = require('vector2');
var Vibe = require('ui/vibe');
var ajax = require('ajax');
var Feature = require('platform/feature');
var Accel = require('ui/accel');
var Settings = require('settings');
// var Timeline = require('timeline');

// globals
var organizations = [], lists = [];
var currentView=null, currentBoardID = null, currentCardID = null, currentMenu = null, currentBoardLists=null;
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
  
main.show();

Accel.on('tap', function(e) {
  console.log('Tap event on axis: ' + e.axis + ' and direction: ' + e.direction + ', currentView = ' + currentView);
  
  // monitor the x axis to test with emulator, y in real app so to monitor wrist twist
  if(e.axis==='y') {
    // refresh current view
    switch(currentView) {
      case null:
      case 'Boards':
        if(currentMenu!==null) {
          currentMenu.hide();
        }
        organizations=[];
        ShowBoards();
        Vibe.vibrate('double');
        break;

        case 'Lists':
        if(currentMenu!==null) {
          currentMenu.hide();
        }
        lists=[];
        ShowLists(currentBoardID);
        Vibe.vibrate('double');
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
        ShowCheckList(currentCardID);
        Vibe.vibrate('double');
        break;

        default:
        // do nothing
        break;
    }
    
  }
});

main.on('click', 'up', function(e) {
  ShowBoards();
});

main.on('click', 'down', function(e) {
  ShowBoards();
});

main.on('click', 'select', function(e) {
  ShowBoards();
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

function ShowBoards() {
  if(token===undefined) {
    // re-read token, fix issue at first run (avoid having to close and open again watchapp)
    token = Settings.option('token');
  }
  if(token===undefined) {
    PleaseConfigure();
    return;
  }

  var card = Loading('Loading Boards...');
  // console.log('OPTIONS: ' + Settings.option());
  // console.log('ShowBoards: token = ' + token);
  // console.log('OPTIONS: ' + JSON.stringify(Settings.option()));
  // // todo: show "please configure if token missing"

  if(organizations.length>0) {
    // already loaded (cached)
    console.log('LOAD BOARDS FROM CACHE');
    card.hide();
    buildBoardsMenu(organizations);
    return;
  }

  console.log('LOAD BOARDS FROM NETWORK');
  ajax({
      url: 'https://api.trello.com/1/member/me/boards?fields=name,idOrganization&filter=open&organization=true&key=12336dca832251b5d7405c340e278b9f&token=' + token,
      type: 'json'
    },
    function(data, status, request) {

      // console.log('DATA: ' + JSON.stringify(data));

      // step1: parse organizations
      for(var b = 0; b < data.length; b++) {
        var theBoard = data[b];
        if(theBoard.organization!==undefined) {
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
          if(!arrayContainsValue(organizations, null)) {
            organizations.push({
              title: '[Without organization]',
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
          if(aBoard.organization!==undefined) {
            if(aBoard.organization.id === organizations[o].id) {
              // add to org items
              organizations[o].items.push({
                title: aBoard.name,
                id: aBoard.id
              });
            }
          } else {
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
      buildBoardsMenu(organizations);

    },
    function(error, status, request) {
      console.log('The ajax request failed: ' + error + ', status: ' + status);
      card.clear(true);
      card.subtitle("Error");
      card.body(error);
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
        ShowLists(e.item.id);
      });

      currentView = 'Boards';
      itemsMenu.show();
      currentMenu = itemsMenu;
}

function ShowLists(boardID) {
  // lists with cards and id of checklists for each card

  var card = Loading('Loading Lists...');

  if(lists.length>0 && currentBoardID===boardID) {
    // already loaded (cached)
    console.log('LOAD LISTS FROM CACHE');
    card.hide();
    buildListsMenu(lists);
    return;
  }

  lists = [], allLists = [];
  currentBoardID = boardID;
  console.log('LOAD LISTS FROM NETWORK');
  ajax({
      url: 'https://api.trello.com/1/boards/' + boardID + '/lists?cards=open&filter=open&fields=name,idBoard&card_fields=name,idChecklists&key=12336dca832251b5d7405c340e278b9f&token=' + token,
      type: 'json'
    },
    function(data, status, request) {

      // step1: parse lists
      for(var b = 0; b < data.length; b++) {
        var theList = data[b];
        if(!arrayContainsValue(lists, theList.id)) {
          // console.log('List ' + theList.name + ' has ' + theList.cards.length + ' cards');
          allLists.push({
            title: theList.name,
            id: theList.id,
            idBoard: theList.idBoard
          });
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

      // step2: add cards to lists
      for(var o = 0; o < lists.length; o++) {
        for(b = 0; b < data.length; b++) {
          var aList = data[b];
          if(aList.id === lists[o].id) {
            // add cards to list items
            aList.cards.forEach(function(c) {
              lists[o].items.push({
                title: c.name,
                id: c.id,
                idChecklists: c.idChecklists,
                // icon: c.idChecklists.length > 0 ? 'images/menu_icon.png' : 'images/menu_icon_inv.png'
              });

            });
            

          }
        }
      }
      
      card.hide();
      currentBoardLists = allLists;
      buildListsMenu(lists);

    },
    function(error, status, request) {
      console.log('The ajax request failed: ' + error + ', status: ' + status);
      card.subtitle("Error");
      card.body(error);
    });

}

function buildListsMenu(lists) {
    var itemsMenu = new UI.Menu({
        highlightBackgroundColor: Feature.color('vivid-violet', 'dark-gray'),
        sections: lists
      });

      itemsMenu.on('select', function(e) {
        // console.log('Selected item #' + e.itemIndex + ' of section #' + e.sectionIndex);
        // console.log('The Card is titled "' + e.item.title + '" and has id ' + e.item.id);
        // open card menu (show checlists)
        // ShowCheckList(e.item.id);
        ShowCard(e.item.id);
      });

      currentView = 'Lists';
      itemsMenu.show();
      currentMenu = itemsMenu;
}

function ShowCard(cardID) {
  var card = Loading('Loading Card...');

  ajax({
      url: 'https://api.trello.com/1/card/' + cardID + '?key=12336dca832251b5d7405c340e278b9f&token=' + token,
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
      if(data.desc.length>420) {
        w.body(data.desc.substr(0,420) + '...');
      } else {
        w.body(data.desc);
      }
      
        w.on('click', 'select', function() {
          ShowCardMenu(data.id, data.badges.checkItems);
        });
     
     currentView = 'Card';
     currentCardID = cardID;
      w.show();

    },
    function(error, status, request) {
      console.log('The ajax request failed: ' + error);
      card.subtitle("Error");
      card.body(error);
      card.show();
    });
}

function ShowCardMenu(cardID, checkItems) {
  var items=[{
              title: 'Move Card',
              idCard: cardID,
              icon: 'images/move_icon.png'
            }];
  console.log('ShowCardMenu checkItems=' + checkItems);

  if(checkItems>0) {
    items.push({
      title: 'Show Checklists',
      idCard: cardID,
      icon: 'images/Listicon.png'
    });
  }
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
      ShowMoveCardMenu(cardID);
      break;

      case 1:
      // move card to another list
      menu.hide();
      ShowCheckList(cardID);
      break;
    }

  });

  menu.show();
}

function ShowMoveCardMenu(cardID) {
  var menu = new UI.Menu( {
    highlightBackgroundColor: Feature.color('vivid-violet', 'dark-gray'),
        icon: 'images/menu_icon.png',
        sections: [{
          title: 'Move card to...',
          backgroundColor: 'white',
          textColor: 'black',
          items: currentBoardLists
        }]
  });

  menu.on('select', function(e) {
    // move card to list e.item.id
    console.log('Move card to list ' + e.item.title + ', ' + e.item.id);
      ajax({
        url: 'https://api.trello.com/1/card/' + cardID + '?idList=' + e.item.id + '&key=12336dca832251b5d7405c340e278b9f&token=' + token,
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
        menu.title("Error");
        menu.body(error);
      });


  });

  menu.show();
}

function ShowCheckList(cardID,sectionIndex, itemIndex) {
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
          ShowCheckList(cardID,e.sectionIndex, e.itemIndex);
          return;
        },
        function(error, status, request) {
          console.log('The ajax request failed: ' + error);
          card.subtitle("Error");
          card.body(error);
          card.show();
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
      card.subtitle("Error");
      card.body(error);
      card.show();
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
          iwin.subtitle("Error");
          iwin.body(error);
          iwin.show();
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
